// Atmonsur Store server: JSON API for the website, PalmPay payment notifications, admin pages, and the built website itself.
import { Hono, type MiddlewareHandler } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { secureHeaders } from 'hono/secure-headers'
import { HTTPException } from 'hono/http-exception'
import { pageHtml, productPage, robots, sitemap } from './seo.ts'
import { productIdFromPath } from './slug.ts'
import { migrate, sql, type PricedRow } from './db.ts'
import { getOrder, notifyNewOrder, settleOrder, type PalmPayOrder } from './orders.ts'
import { notifyOwner } from './notify.ts'
import { lineTotal, unitPrice } from './pricing.ts'
import { parseCheckout, parseEnquiry, REFERENCE } from './validate.ts'
import { newReference, notificationValid, palmpay, palmpayConfigured } from './palmpay.ts'
import { admin } from './admin.ts'
import { accounts, currentCustomer } from './accounts.ts'
import { rateLimit } from './rateLimit.ts'

export const app = new Hono()
const PALMPAY_NOTIFY_PATH = '/api/palmpay/notify'
const siteUrl = (c: { req: { url: string } }) => process.env.SITE_URL ?? new URL(c.req.url).origin
app.use(secureHeaders())

// Cross-site protection for the login cookie: other websites can't send JSON here without a CORS preflight,
// which this server never approves. So every API POST must be JSON (PalmPay's notification is checked by signature).
const jsonOnly: MiddlewareHandler = async (c, next) => {
  if (c.req.method === 'POST' && c.req.path !== PALMPAY_NOTIFY_PATH && !c.req.header('content-type')?.startsWith('application/json')) {
    return c.json({ error: 'Expected JSON.' }, 415)
  }
  await next()
}
app.use('/api/*', jsonOnly)
app.route('/api/account', accounts)

app.get('/api/catalogue', async c => {
  const [categories, products, zones] = await Promise.all([
    sql`select name, note, color, art_kind from categories order by sort, name`,
    sql`select id, name, category, pack, price_kobo, bulk_price_kobo, bulk_min_qty, badge, image_url, art_kind, color, description
        from products where active order by sort, id`,
    sql`select id, name, fee_kobo, needs_address from delivery_zones where active order by sort, id`,
  ])
  c.header('Cache-Control', 'public, max-age=60')
  return c.json({ categories, products, zones, payments: palmpayConfigured() ? 'palmpay' : 'on_delivery' })
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
  const account = await currentCustomer(c) // null for guest checkout
  const paymentMethod = palmpayConfigured() ? 'palmpay' : 'on_delivery'

  const orderId = await sql.begin(async tx => {
    const [order] = await tx`insert into orders ${tx({
      reference, payment_method: paymentMethod, customer_id: account?.id ?? null, customer_name: customer.name, email: customer.email, phone: customer.phone,
      delivery_zone: zone.id, delivery_zone_name: zone.name,
      address: zone.needs_address ? customer.address : null, city: zone.needs_address ? customer.city : null, notes: customer.notes || null,
      subtotal_kobo: subtotal, delivery_fee_kobo: zone.fee_kobo, total_kobo: total,
    })} returning id`
    await tx`insert into order_items ${tx(lines.map(l => ({ ...l, order_id: order.id })))}`
    // Remember the delivery details on the account so the next checkout is pre-filled.
    if (account) await tx`update customers set phone = ${customer.phone}, delivery_zone = ${zone.id},
      address = coalesce(${zone.needs_address ? customer.address : null}, address), city = coalesce(${zone.needs_address ? customer.city : null}, city)
      where id = ${account.id}`
    return order.id as number
  })

  if (paymentMethod === 'on_delivery') { // no online payment yet: the order is placed now and paid on delivery or pickup
    await notifyNewOrder((await getOrder(reference))!)
    return c.json({ checkout_url: `/order?reference=${reference}`, reference })
  }

  try {
    const data = await palmpay('/api/v2/payment/merchant/createorder', {
      orderId: reference, amount: total, currency: 'NGN',
      title: 'Atmonsur Store order',
      description: lines.map(l => `${l.qty} x ${l.name}`).join(', ').slice(0, 200),
      notifyUrl: siteUrl(c) + PALMPAY_NOTIFY_PATH,
      callBackUrl: `${siteUrl(c)}/order?reference=${reference}`,
    })
    if (!data?.checkoutUrl) throw new Error('PalmPay returned no checkoutUrl')
    return c.json({ checkout_url: data.checkoutUrl, reference })
  } catch (e) {
    console.error(e)
    await sql`update orders set status = 'failed' where id = ${orderId}`
    return c.json({ error: 'Payment could not be started. Please try again in a moment.' }, 502)
  }
})

// Confirmation page. If PalmPay's notification hasn't arrived yet, ask PalmPay directly so the customer sees the result now.
app.get('/api/orders/:reference', rateLimit(30), async c => {
  const reference = c.req.param('reference')
  if (!REFERENCE.test(reference)) return c.json({ error: 'Order not found.' }, 404)
  let order = await getOrder(reference)
  if (!order) return c.json({ error: 'Order not found.' }, 404)
  if (order.status === 'pending' && order.payment_method === 'palmpay') {
    try {
      const tx: PalmPayOrder = await palmpay('/api/v2/payment/merchant/order/queryStatus', { orderId: reference })
      order = (await settleOrder({ ...tx, orderId: reference })) ?? order
    } catch (e) {
      console.error(e) // PalmPay unreachable or order unknown to it: stays pending, the customer can check again
    }
  }
  // Only what the confirmation page needs; the unguessable reference is the customer's key to it.
  return c.json({
    reference: order.reference, status: order.status, payment_method: order.payment_method, first_name: order.customer_name.split(' ')[0], delivery: order.delivery_zone_name,
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

// PalmPay posts payment results here (we send this address as notifyUrl with every order).
// It must answer the plain text "success", or PalmPay retries (5s, 30s, 4m … up to 15h).
app.post(PALMPAY_NOTIFY_PATH, async c => {
  const raw = await c.req.text()
  let body: Record<string, unknown>
  try { body = JSON.parse(raw) } catch { body = Object.fromEntries(new URLSearchParams(raw)) } // docs show JSON; accept a form post too
  if (!notificationValid(body, process.env.PALMPAY_PUBLIC_KEY ?? '')) {
    console.error('PalmPay notification with an invalid signature ignored', body.orderId)
    return c.text('invalid signature', 401)
  }
  await settleOrder(body as unknown as PalmPayOrder) // only orderStatus 2 with the exact amount marks an order paid
  return c.text('success')
})

app.all('/api/*', c => c.json({ error: 'Not found' }, 404))
app.route('/admin', admin)

// The built website (npm run build → dist/). Hashed asset files never change, so browsers may cache them for a year.
app.use('/assets/*', async (c, next) => { await next(); c.header('Cache-Control', 'public, max-age=31536000, immutable') })
app.get('/', c => c.html(pageHtml())) // not the raw dist/index.html: the preview image needs a full address
app.get('/index.html', c => c.redirect('/', 301))
app.use('/*', serveStatic({ root: './dist' }))
app.get('/sitemap.xml', async c => c.body(await sitemap(), 200, { 'Content-Type': 'application/xml; charset=utf-8' }))
app.get('/robots.txt', c => c.text(robots()))
app.get('/product/*', async c => {
  const id = productIdFromPath(c.req.path)
  const html = id ? await productPage(id) : null
  return html ? c.html(html) : c.html(pageHtml(), 404) // the app shows "no longer available"
})
app.get('*', c => c.html(pageHtml())) // every other path is a page of the single-page app

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse() // e.g. 401 password prompt, 403 cross-site form
  console.error(err)
  return c.req.path.startsWith('/api/') ? c.json({ error: 'Something went wrong. Please try again.' }, 500) : c.text('Something went wrong.', 500)
})

await migrate() // once per start (on Vercel: once per function instance)
if (!process.env.VERCEL) { // on Vercel, server/src/vercel.ts hands requests to `app` instead
  const port = Number(process.env.PORT ?? 3000)
  serve({ fetch: app.fetch, port }, () => console.log(`Atmonsur Store running on http://localhost:${port}`))
}
