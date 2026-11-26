// Atmonsur Store server: JSON API for the website, Paystack webhook, admin pages, and the built website itself.
import { Hono, type MiddlewareHandler } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { secureHeaders } from 'hono/secure-headers'
import { HTTPException } from 'hono/http-exception'
import { readFileSync } from 'node:fs'
import { migrate, sql, type PricedRow } from './db.ts'
import { getOrder, paystack, settleOrder } from './orders.ts'
import { notifyOwner } from './notify.ts'
import { lineTotal, unitPrice } from './pricing.ts'
import { parseCheckout, parseEnquiry, REFERENCE } from './validate.ts'
import { newReference, paystackSignatureValid } from './paystack.ts'
import { admin } from './admin.ts'

const app = new Hono()
app.use(secureHeaders())

// shortcut: per-process memory, so limits reset on restart and aren't shared between instances; fine for one server.
const hits = new Map<string, { n: number; reset: number }>()
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (h.reset < now) hits.delete(k) }, 60_000).unref()
const rateLimit = (perMinute: number): MiddlewareHandler => async (c, next) => {
  const key = `${c.req.path}|${c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'local'}`
  const now = Date.now(), h = hits.get(key)
  if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + 60_000 })
  else if (++h.n > perMinute) return c.json({ error: 'Too many requests. Please wait a minute and try again.' }, 429)
  await next()
}

app.get('/api/catalogue', async c => {
  const [categories, products, zones] = await Promise.all([
    sql`select name, note, color, art_kind from categories order by sort, name`,
    sql`select id, name, category, pack, price_kobo, bulk_price_kobo, bulk_min_qty, badge, image_url, art_kind, color
        from products where active order by sort, id`,
    sql`select id, name, fee_kobo, needs_address from delivery_zones where active order by sort, id`,
  ])
  c.header('Cache-Control', 'public, max-age=60')
  return c.json({ categories, products, zones })
})

// Prices and delivery fees always come from the database here, never from the browser.
app.post('/api/checkout', rateLimit(10), async c => {
  const parsed = parseCheckout(await c.req.json().catch(() => null))
  if (!parsed.ok) return c.json({ error: parsed.error }, 400)
  const { items, customer } = parsed.value

  const products = await sql<PricedRow[]>`select id, name, pack, price_kobo, bulk_price_kobo, bulk_min_qty from products where active and id in ${sql(items.map(i => i.product_id))}`
  const [zone] = await sql`select * from delivery_zones where id = ${customer.zone} and active`
  if (!zone) return c.json({ error: 'Please choose a valid delivery option.' }, 400)
  if (zone.needs_address && (customer.address.length < 5 || !customer.city)) return c.json({ error: 'Please enter your delivery address and city.' }, 400)
  if (products.length !== items.length) return c.json({ error: 'Some items in your cart are no longer available. Please review your cart.' }, 409)

  const lines = items.map(i => {
    const p = products.find(p => p.id === i.product_id)!
    return { product_id: p.id, name: p.name, pack: p.pack, qty: i.qty, unit_price_kobo: unitPrice(p, i.qty), line_total_kobo: lineTotal(p, i.qty) }
  })
  const subtotal = lines.reduce((s, l) => s + l.line_total_kobo, 0)
  const total = subtotal + zone.fee_kobo
  const reference = newReference()

  const orderId = await sql.begin(async tx => {
    const [order] = await tx`insert into orders ${tx({
      reference, customer_name: customer.name, email: customer.email, phone: customer.phone,
      delivery_zone: zone.id, delivery_zone_name: zone.name,
      address: zone.needs_address ? customer.address : null, city: zone.needs_address ? customer.city : null, notes: customer.notes || null,
      subtotal_kobo: subtotal, delivery_fee_kobo: zone.fee_kobo, total_kobo: total,
    })} returning id`
    await tx`insert into order_items ${tx(lines.map(l => ({ ...l, order_id: order.id })))}`
    return order.id as number
  })

  try {
    const tx = await paystack('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: customer.email, amount: total, currency: 'NGN', reference,
        callback_url: `${process.env.SITE_URL ?? new URL(c.req.url).origin}/order?reference=${reference}`,
        metadata: { order_id: orderId, customer_name: customer.name, phone: customer.phone },
      }),
    })
    return c.json({ authorization_url: tx.authorization_url, reference })
  } catch (e) {
    console.error(e)
    await sql`update orders set status = 'failed' where id = ${orderId}`
    return c.json({ error: 'Payment could not be started. Please try again in a moment.' }, 502)
  }
})

// Confirmation page. If Paystack's webhook hasn't arrived yet, ask Paystack directly so the customer sees the result now.
app.get('/api/orders/:reference', rateLimit(30), async c => {
  const reference = c.req.param('reference')
  if (!REFERENCE.test(reference)) return c.json({ error: 'Order not found.' }, 404)
  let order = await getOrder(reference)
  if (!order) return c.json({ error: 'Order not found.' }, 404)
  if (order.status === 'pending') {
    try {
      order = (await settleOrder(await paystack(`/transaction/verify/${encodeURIComponent(reference)}`))) ?? order
    } catch (e) {
      console.error(e) // no completed transaction yet (customer closed the payment page): stays pending
    }
  }
  // Only what the confirmation page needs; the unguessable reference is the customer's key to it.
  return c.json({
    reference: order.reference, status: order.status, first_name: order.customer_name.split(' ')[0], delivery: order.delivery_zone_name,
    items: order.items.map(i => ({ name: i.name, pack: i.pack, qty: i.qty, line_total_kobo: i.line_total_kobo })),
    subtotal_kobo: order.subtotal_kobo, delivery_fee_kobo: order.delivery_fee_kobo, total_kobo: order.total_kobo,
  })
})

app.post('/api/enquiries', rateLimit(5), async c => {
  const parsed = parseEnquiry(await c.req.json().catch(() => null))
  if (parsed.spam) return c.json({ ok: true }) // look successful to bots
  if (!parsed.ok) return c.json({ error: parsed.error }, 400)
  const e = parsed.value
  await sql`insert into enquiries ${sql(e)}`
  await notifyOwner(`New enquiry: ${e.subject} (${e.name})`, `${e.message}\n\nName: ${e.name}\nPhone: ${e.phone}\nEmail: ${e.email}\n\nAll enquiries: ${process.env.SITE_URL ?? ''}/admin/enquiries`)
  return c.json({ ok: true })
})

// Set in Paystack → Settings → API Keys & Webhooks: https://<your-domain>/api/paystack/webhook
app.post('/api/paystack/webhook', async c => {
  const raw = await c.req.text()
  if (!(await paystackSignatureValid(raw, c.req.header('x-paystack-signature') ?? null, process.env.PAYSTACK_SECRET_KEY ?? ''))) {
    return c.text('Invalid signature', 401)
  }
  const event = JSON.parse(raw)
  if (event.event === 'charge.success') await settleOrder(event.data)
  return c.text('ok') // 200 for every signed event so Paystack stops retrying
})

app.all('/api/*', c => c.json({ error: 'Not found' }, 404))
app.route('/admin', admin)

// The built website (npm run build → dist/). Hashed asset files never change, so browsers may cache them for a year.
app.use('/assets/*', async (c, next) => { await next(); c.header('Cache-Control', 'public, max-age=31536000, immutable') })
app.use('/*', serveStatic({ root: './dist' }))
let indexHtml = ''
app.get('*', c => {
  indexHtml ||= readFileSync('./dist/index.html', 'utf8') // every other path is a page of the single-page app
  return c.html(indexHtml)
})

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse() // e.g. 401 password prompt, 403 cross-site form
  console.error(err)
  return c.req.path.startsWith('/api/') ? c.json({ error: 'Something went wrong. Please try again.' }, 500) : c.text('Something went wrong.', 500)
})

await migrate()
const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, () => console.log(`Atmonsur Store running on http://localhost:${port}`))
