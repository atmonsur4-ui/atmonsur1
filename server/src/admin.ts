// Password-protected admin at /admin: orders, products, categories, delivery fees and enquiries.
// Plain server-rendered HTML; `html` escapes every interpolated value.
import { Hono, type Context } from 'hono'
import { html } from 'hono/html'
import { basicAuth } from 'hono/basic-auth'
import { csrf } from 'hono/csrf'
import { sql } from './db.ts'
import { naira } from './notify.ts'
import { getOrder } from './orders.ts'
import { parseCategoryForm, parseProductForm, parseZoneForm } from './validate.ts'

export const admin = new Hono()

admin.use('*', async (c, next) => {
  const password = process.env.ADMIN_PASSWORD ?? ''
  if (password.length < 12) return c.text('Admin is disabled: set ADMIN_PASSWORD (at least 12 characters) on the server.', 503)
  return basicAuth({ username: process.env.ADMIN_USER ?? 'admin', password })(c, next)
})
// Browsers resend the admin password automatically, so reject form posts that come from other sites.
admin.use('*', csrf({ origin: (origin, c) => origin === (process.env.SITE_URL ?? new URL(c.req.url).origin) }))
admin.use('*', async (c, next) => { await next(); c.header('Cache-Control', 'no-store'); c.header('X-Robots-Tag', 'noindex') })

const ART = ['bottle', 'carton', 'bag', 'pack', 'jar', 'cleaner']
const kobo = (k: number) => (k / 100).toString()
const when = (d: Date | null) => (d ? new Date(d).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' }) : '')

const page = (title: string, body: unknown, notice = '') => html`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title} · Atmonsur admin</title>
<style>
  body{font:15px/1.5 system-ui,sans-serif;margin:0;color:#12223c;background:#f4f6f9}
  header{background:#0b2144;color:#fff;padding:12px 20px;display:flex;gap:20px;align-items:center;flex-wrap:wrap}
  header b{margin-right:auto}header a{color:#fff;text-decoration:none;font-weight:600}header a:hover{text-decoration:underline}
  main{max-width:1100px;margin:0 auto;padding:24px 20px}h1{font-size:24px;margin:0 0 16px}h2{font-size:18px;margin:28px 0 10px}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #dde3ea}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #e8ecf1;vertical-align:top}
  th{background:#f0f3f7;font-size:13px}a{color:#0b5bd3}.muted{color:#5b6879;font-size:13px}
  .pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:700;background:#e8ecf1}
  .paid,.delivered{background:#dff4e8;color:#13633f}.pending,.new{background:#fff1d6;color:#7a4b00}.failed,.cancelled{background:#fde2e2;color:#9b1c1c}.dispatched{background:#e1ecff;color:#173f8a}
  form.card,.card{background:#fff;border:1px solid #dde3ea;border-radius:8px;padding:18px;margin-bottom:16px}
  label{display:block;font-weight:600;font-size:13px;margin:10px 0 4px}input,select,textarea{font:inherit;padding:7px 9px;border:1px solid #b9c3cf;border-radius:5px;width:100%;box-sizing:border-box}
  input[type=checkbox]{width:auto}.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
  button{font:inherit;font-weight:700;background:#0b2144;color:#fff;border:0;border-radius:5px;padding:8px 16px;cursor:pointer;margin-top:12px}
  .notice{padding:10px 14px;border-radius:6px;margin-bottom:16px;background:#dff4e8;color:#13633f}.notice.error{background:#fde2e2;color:#9b1c1c}
  .filters a{margin-right:14px}.inline{display:flex;gap:8px;align-items:center}.inline select{width:auto}.inline button{margin:0}
</style></head><body>
<header><b>Atmonsur admin</b><a href="/admin/orders">Orders</a><a href="/admin/products">Products</a><a href="/admin/categories">Categories</a><a href="/admin/delivery">Delivery fees</a><a href="/admin/enquiries">Enquiries</a><a href="/admin/customers">Customers</a><a href="/" target="_blank">View shop ↗</a></header>
<main>${notice ? html`<p class="notice ${notice.startsWith('Error') ? 'error' : ''}" role="status">${notice}</p>` : ''}<h1>${title}</h1>${body}</main></body></html>`

const back = (path: string, msg: string) => `${path}${path.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}`

admin.get('/', c => c.redirect('/admin/orders'))

// ---- Orders ----
admin.get('/orders', async c => {
  const status = c.req.query('status') ?? 'paid'
  const orders = status === 'all'
    ? await sql`select * from orders order by created_at desc limit 200`
    : await sql`select * from orders where status = ${status} order by created_at desc limit 200`
  return c.html(page('Orders', html`
    <p class="filters">Show: ${['paid', 'pending', 'failed', 'all'].map(s => html`<a href="?status=${s}" ${s === status ? html`aria-current="page" style="font-weight:700"` : ''}>${s[0].toUpperCase() + s.slice(1)}</a>`)}</p>
    <p class="muted">Only <b>paid</b> orders have been paid for. Pending means the customer started checkout but hasn't paid (yet).</p>
    <table><thead><tr><th>Date</th><th>Reference</th><th>Customer</th><th>Delivery</th><th>Total</th><th>Payment</th><th>Fulfilment</th></tr></thead><tbody>
    ${orders.length ? orders.map(o => html`<tr><td>${when(o.created_at)}</td><td><a href="/admin/orders/${o.reference}">${o.reference}</a></td><td>${o.customer_name}<br><span class="muted">${o.phone}</span></td><td>${o.delivery_zone_name}</td><td>${naira(o.total_kobo)}</td><td><span class="pill ${o.status}">${o.status}</span></td><td><span class="pill ${o.fulfilment}">${o.fulfilment}</span></td></tr>`) : html`<tr><td colspan="7" class="muted">No orders here yet.</td></tr>`}
    </tbody></table>`, c.req.query('msg')))
})

admin.get('/orders/:reference', async c => {
  const o = await getOrder(c.req.param('reference'))
  if (!o) return c.html(page('Order not found', html`<a href="/admin/orders">Back to orders</a>`), 404)
  return c.html(page(`Order ${o.reference}`, html`
    <div class="card"><p><span class="pill ${o.status}">Payment: ${o.status}</span> ${o.paid_at ? html`<span class="muted">paid ${when(o.paid_at)} · PalmPay order ${o.payment_reference}</span>` : ''}</p>
    <p><b>${o.customer_name}</b> <span class="pill">${o.customer_id ? 'account' : 'guest'}</span><br><a href="tel:${o.phone}">${o.phone}</a> · <a href="mailto:${o.email}">${o.email}</a></p>
    <p><b>${o.delivery_zone_name}</b>${o.address ? html`<br>${o.address}, ${o.city}` : ''}</p>${o.notes ? html`<p><b>Notes:</b> ${o.notes}</p>` : ''}
    <p class="muted">Placed ${when(o.created_at)}</p></div>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>
    ${o.items.map(i => html`<tr><td>${i.name}<br><span class="muted">${i.pack}</span></td><td>${i.qty}</td><td>${naira(i.unit_price_kobo)}</td><td>${naira(i.line_total_kobo)}</td></tr>`)}
    <tr><td colspan="3">Subtotal</td><td>${naira(o.subtotal_kobo)}</td></tr><tr><td colspan="3">Delivery</td><td>${naira(o.delivery_fee_kobo)}</td></tr>
    <tr><th colspan="3">Total</th><th>${naira(o.total_kobo)}</th></tr></tbody></table>
    <form class="card" method="post" action="/admin/orders/${o.reference}/fulfilment" style="margin-top:16px"><label for="f">Fulfilment</label>
      <div class="inline"><select id="f" name="fulfilment">${['new', 'dispatched', 'delivered', 'cancelled'].map(f => html`<option ${f === o.fulfilment ? 'selected' : ''}>${f}</option>`)}</select><button>Save</button></div>
      ${o.status === 'paid' ? html`<p class="muted">Cancelling here does not refund the customer. Refund paid orders from your PalmPay merchant dashboard.</p>` : ''}</form>
    <p><a href="/admin/orders">← All orders</a></p>`, c.req.query('msg')))
})

admin.post('/orders/:reference/fulfilment', async c => {
  const { fulfilment } = await c.req.parseBody()
  const ref = c.req.param('reference')
  if (!['new', 'dispatched', 'delivered', 'cancelled'].includes(String(fulfilment))) return c.redirect(back(`/admin/orders/${ref}`, 'Error: unknown status'))
  await sql`update orders set fulfilment = ${String(fulfilment)} where reference = ${ref}`
  return c.redirect(back(`/admin/orders/${ref}`, 'Saved'))
})

// ---- Products ----
admin.get('/products', async c => {
  const products = await sql`select * from products order by sort, id`
  return c.html(page('Products', html`
    <p><a href="/admin/products/new">+ Add a product</a></p>
    <table><thead><tr><th>Product</th><th>Category</th><th>Retail</th><th>Wholesale</th><th>Shown on site</th></tr></thead><tbody>
    ${products.map(p => html`<tr><td><a href="/admin/products/${p.id}">${p.name}</a><br><span class="muted">${p.pack}</span></td><td>${p.category}</td><td>${naira(p.price_kobo)}</td><td>${naira(p.bulk_price_kobo)} <span class="muted">from ${p.bulk_min_qty}</span></td><td>${p.active ? 'Yes' : html`<span class="pill failed">Hidden</span>`}</td></tr>`)}
    </tbody></table>`, c.req.query('msg')))
})

const productForm = async (p: Record<string, any> | null, error = '') => {
  const categories = await sql`select name from categories order by sort, name`
  const v = p ?? { active: true, bulk_min_qty: 5, art_kind: 'pack', color: '#f47820', sort: 0 }
  return page(p?.id ? `Edit ${p.name}` : 'Add a product', html`
    <form class="card" method="post" action="/admin/products${p?.id ? `/${p.id}` : ''}">
      <label for="name">Name</label><input id="name" name="name" required maxlength="120" value="${v.name ?? ''}">
      <div class="row"><div><label for="category">Category</label><select id="category" name="category">${categories.map(c => html`<option ${c.name === v.category ? 'selected' : ''}>${c.name}</option>`)}</select></div>
        <div><label for="pack">Pack size</label><input id="pack" name="pack" required maxlength="80" value="${v.pack ?? ''}" placeholder="75cl × 12 bottles"></div></div>
      <div class="row"><div><label for="price">Retail price (₦)</label><input id="price" name="price" required inputmode="decimal" value="${v.price_kobo ? kobo(v.price_kobo) : v.price ?? ''}"></div>
        <div><label for="bulk_price">Wholesale price (₦)</label><input id="bulk_price" name="bulk_price" required inputmode="decimal" value="${v.bulk_price_kobo ? kobo(v.bulk_price_kobo) : v.bulk_price ?? ''}"></div>
        <div><label for="bulk_min_qty">Wholesale from (packs)</label><input id="bulk_min_qty" name="bulk_min_qty" type="number" min="1" required value="${v.bulk_min_qty}"></div></div>
      <div class="row"><div><label for="badge">Badge (optional)</label><input id="badge" name="badge" maxlength="30" value="${v.badge ?? ''}" placeholder="Bestseller"></div>
        <div><label for="sort">Order on site</label><input id="sort" name="sort" type="number" value="${v.sort}"></div></div>
      <label for="description">Description for the product page (optional)</label><textarea id="description" name="description" rows="4" maxlength="2000" placeholder="What it is, brand, ingredients or uses, storage, carton contents…">${v.description ?? ''}</textarea>
      <label for="image_url">Photo link (optional, https://…)</label><input id="image_url" name="image_url" maxlength="500" value="${v.image_url ?? ''}">
      <div class="row"><div><label for="art_kind">Illustration if no photo</label><select id="art_kind" name="art_kind">${ART.map(a => html`<option ${a === v.art_kind ? 'selected' : ''}>${a}</option>`)}</select></div>
        <div><label for="color">Illustration colour</label><input id="color" name="color" type="color" value="${v.color}"></div></div>
      <label><input type="checkbox" name="active" ${v.active ? 'checked' : ''}> Show on the website</label>
      <button>Save product</button></form><p><a href="/admin/products">← All products</a></p>`, error ? `Error: ${error}` : '')
}

admin.get('/products/new', async c => c.html(await productForm(null)))
admin.get('/products/:id{[0-9]+}', async c => {
  const [p] = await sql`select * from products where id = ${Number(c.req.param('id'))}`
  return p ? c.html(await productForm(p, '')) : c.notFound()
})
const saveProduct = async (c: Context, id: number | null) => {
  const form = await c.req.parseBody()
  const parsed = parseProductForm(form)
  if (!parsed.ok) return c.html(await productForm({ ...form, id, active: form.active === 'on' }, parsed.error), 400)
  if (id) await sql`update products set ${sql(parsed.value)} where id = ${id}`
  else await sql`insert into products ${sql(parsed.value)}`
  return c.redirect(back('/admin/products', `Saved ${parsed.value.name}`))
}
admin.post('/products', c => saveProduct(c, null))
admin.post('/products/:id{[0-9]+}', c => saveProduct(c, Number(c.req.param('id'))))

// ---- Categories ----
admin.get('/categories', async c => {
  const cats = await sql`select c.*, (select count(*)::int from products p where p.category = c.name) as products from categories c order by sort, name`
  const row = (k: Record<string, any>, isNew = false) => html`<form class="card" method="post" action="/admin/categories">
    <div class="row"><div><label>Name</label><input name="name" required maxlength="60" value="${k.name ?? ''}" ${isNew ? '' : 'readonly'}></div>
    <div><label>Short description</label><input name="note" maxlength="60" value="${k.note ?? ''}"></div>
    <div><label>Card colour</label><input name="color" type="color" value="${k.color ?? '#f4f6f8'}"></div>
    <div><label>Illustration</label><select name="art_kind">${ART.map(a => html`<option ${a === k.art_kind ? 'selected' : ''}>${a}</option>`)}</select></div>
    <div><label>Order</label><input name="sort" type="number" value="${k.sort ?? 0}"></div></div>
    <button>${isNew ? 'Add category' : 'Save'}</button> ${isNew ? '' : html`<span class="muted">${k.products} product(s)</span>`}</form>`
  return c.html(page('Categories', html`${cats.map(k => row(k))}<h2>Add a category</h2>${row({}, true)}`, c.req.query('msg')))
})
admin.post('/categories', async c => {
  const parsed = parseCategoryForm(await c.req.parseBody())
  if (!parsed.ok) return c.redirect(back('/admin/categories', `Error: ${parsed.error}`))
  const v = parsed.value
  await sql`insert into categories ${sql(v)} on conflict (name) do update set note = ${v.note}, color = ${v.color}, art_kind = ${v.art_kind}, sort = ${v.sort}`
  return c.redirect(back('/admin/categories', `Saved ${v.name}`))
})

// ---- Delivery zones ----
admin.get('/delivery', async c => {
  const zones = await sql`select * from delivery_zones order by sort, id`
  const row = (z: Record<string, any>, isNew = false) => html`<form class="card" method="post" action="/admin/delivery">
    <div class="row"><div><label>Code</label><input name="id" required value="${z.id ?? ''}" ${isNew ? '' : 'readonly'} placeholder="ikorodu"></div>
    <div style="grid-column:span 2"><label>Name shown at checkout</label><input name="name" required maxlength="100" value="${z.name ?? ''}"></div>
    <div><label>Fee (₦)</label><input name="fee" required inputmode="decimal" value="${z.fee_kobo != null ? kobo(z.fee_kobo) : ''}"></div>
    <div><label>Order</label><input name="sort" type="number" value="${z.sort ?? 0}"></div></div>
    <label><input type="checkbox" name="needs_address" ${z.needs_address ?? true ? 'checked' : ''}> Ask for a delivery address</label>
    <label><input type="checkbox" name="active" ${z.active ?? true ? 'checked' : ''}> Offer at checkout</label>
    <button>${isNew ? 'Add option' : 'Save'}</button></form>`
  return c.html(page('Delivery fees', html`<p class="muted">Customers pick one of these at checkout, and its fee is added to what they pay.</p>${zones.map(z => row(z))}<h2>Add a delivery option</h2>${row({}, true)}`, c.req.query('msg')))
})
admin.post('/delivery', async c => {
  const parsed = parseZoneForm(await c.req.parseBody())
  if (!parsed.ok) return c.redirect(back('/admin/delivery', `Error: ${parsed.error}`))
  const v = parsed.value
  await sql`insert into delivery_zones ${sql(v)} on conflict (id) do update set name = ${v.name}, fee_kobo = ${v.fee_kobo}, needs_address = ${v.needs_address}, active = ${v.active}, sort = ${v.sort}`
  return c.redirect(back('/admin/delivery', `Saved ${v.name}`))
})

// ---- Customers (accounts). Passwords are never shown; customers reset their own. ----
admin.get('/customers', async c => {
  const rows = await sql`select c.id, c.name, c.email, c.phone, c.email_verified_at, c.created_at,
      count(o.id) filter (where o.status = 'paid')::int as paid_orders,
      coalesce(sum(o.total_kobo) filter (where o.status = 'paid'), 0)::int as paid_total
    from customers c left join orders o on o.customer_id = c.id group by c.id order by c.created_at desc limit 500`
  return c.html(page('Customers', html`<p class="muted">Customers who created an account. Guests who checked out without one appear only on their orders.</p>
    <table><thead><tr><th>Customer</th><th>Joined</th><th>Email confirmed</th><th>Paid orders</th><th>Total spent</th></tr></thead><tbody>
    ${rows.length ? rows.map(r => html`<tr><td>${r.name}<br><span class="muted"><a href="mailto:${r.email}">${r.email}</a> · <a href="tel:${r.phone}">${r.phone}</a></span></td><td>${when(r.created_at)}</td><td>${r.email_verified_at ? 'Yes' : 'Not yet'}</td><td>${r.paid_orders}</td><td>${naira(r.paid_total)}</td></tr>`)
      : html`<tr><td colspan="5" class="muted">No accounts yet.</td></tr>`}
    </tbody></table>`))
})

// ---- Enquiries ----
admin.get('/enquiries', async c => {
  const rows = await sql`select * from enquiries order by handled, created_at desc limit 200`
  return c.html(page('Enquiries', html`${rows.length ? rows.map(e => html`<div class="card" style="${e.handled ? 'opacity:.6' : ''}">
    <p><b>${e.subject}</b> · <span class="muted">${when(e.created_at)}</span></p><p style="white-space:pre-wrap">${e.message}</p>
    <p>${e.name} · <a href="tel:${e.phone}">${e.phone}</a> · <a href="mailto:${e.email}">${e.email}</a></p>
    <form method="post" action="/admin/enquiries/${e.id}"><input type="hidden" name="handled" value="${e.handled ? '' : 'on'}"><button>${e.handled ? 'Mark as not handled' : 'Mark as handled'}</button></form></div>`)
    : html`<p class="muted">No enquiries yet.</p>`}`, c.req.query('msg')))
})
admin.post('/enquiries/:id{[0-9]+}', async c => {
  const { handled } = await c.req.parseBody()
  await sql`update enquiries set handled = ${handled === 'on'} where id = ${Number(c.req.param('id'))}`
  return c.redirect('/admin/enquiries')
})
