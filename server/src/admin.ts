// Password-protected admin at /admin: dashboard, orders, products, categories, delivery fees, enquiries, customers.
// Plain server-rendered HTML; `html` escapes every interpolated value.
import { Hono, type Context } from 'hono'
import { html } from 'hono/html'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { csrf } from 'hono/csrf'
import { createHash, timingSafeEqual } from 'node:crypto'
import { sql } from './db.ts'
import { naira } from './notify.ts'
import { getOrder } from './orders.ts'
import { clientIp, overLimit } from './rateLimit.ts'
import { imageType, MAX_IMAGE_BYTES, ownImage, parseCategoryForm, parseProductForm, parseZoneForm, UPLOADED_IMAGE } from './validate.ts'

export const admin = new Hono()

// ---- Login ----
// The session is a signed cookie holding its expiry time. It's signed with a key made from the admin username and
// password, so changing ADMIN_PASSWORD (or ADMIN_USER) logs every device out.
const ADMIN_COOKIE = 'atm_admin'
const SESSION_HOURS = 12
const adminUser = () => process.env.ADMIN_USER ?? 'admin'
const adminPassword = () => process.env.ADMIN_PASSWORD ?? ''
const sessionKey = () => `atmonsur-admin-session:${adminUser()}:${adminPassword()}`
const sameText = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
const safeNext = (v: unknown) => (typeof v === 'string' && /^\/admin(\/|$|\?)/.test(v) ? v : '/admin')

async function signedIn(c: Context) {
  const value = await getSignedCookie(c, sessionKey(), ADMIN_COOKIE)
  return typeof value === 'string' && Number(value) > Date.now()
}

admin.use('*', async (c, next) => { await next(); c.header('Cache-Control', 'no-store'); c.header('X-Robots-Tag', 'noindex') })
// The login cookie is sent automatically, so reject form posts that come from other websites.
admin.use('*', csrf({ origin: (origin, c) => origin === (process.env.SITE_URL ?? new URL(c.req.url).origin) }))
admin.use('*', async (c, next) => {
  if (adminPassword().length < 12) return c.html(loginPage({ setup: true }), 503)
  if (c.req.path === '/admin/login' || (await signedIn(c))) return next()
  const target = c.req.method === 'GET' ? c.req.path + (new URL(c.req.url).search) : '/admin'
  return c.redirect(`/admin/login?next=${encodeURIComponent(target)}`)
})

admin.get('/login', async c => (await signedIn(c)) ? c.redirect('/admin') : c.html(loginPage({ next: c.req.query('next') })))

admin.post('/login', async c => {
  const form = await c.req.parseBody()
  const next = safeNext(form.next)
  if (overLimit(`admin-login|${clientIp(c)}`, 10, 15 * 60_000)) return c.html(loginPage({ next, error: 'Too many attempts. Please wait 15 minutes and try again.' }), 429)
  const userOk = sameText(String(form.username ?? '').trim(), adminUser())
  const passOk = sameText(String(form.password ?? ''), adminPassword())
  if (!userOk || !passOk) return c.html(loginPage({ next, error: 'Username or password is incorrect.' }), 401)
  await setSignedCookie(c, ADMIN_COOKIE, String(Date.now() + SESSION_HOURS * 36e5), sessionKey(), {
    httpOnly: true, sameSite: 'Lax', path: '/admin', maxAge: SESSION_HOURS * 3600,
    secure: (process.env.SITE_URL ?? new URL(c.req.url).origin).startsWith('https://'),
  })
  return c.redirect(next)
})

admin.post('/logout', c => {
  deleteCookie(c, ADMIN_COOKIE, { path: '/admin' })
  return c.redirect('/admin/login?out=1')
})

// ---- Layout ----
const ART = ['bottle', 'carton', 'bag', 'pack', 'jar', 'cleaner']
const kobo = (k: number) => (k / 100).toString()
const when = (d: Date | null) => (d ? new Date(d).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' }) : '')

const STYLE = html`<style>
  :root{--navy:#0b2144;--navy2:#16365f;--orange:#c2540a;--ink:#12223c;--muted:#5b6879;--line:#e3e8ee;--bg:#f4f6f9}
  *{box-sizing:border-box}body{font:15px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;margin:0;color:var(--ink);background:var(--bg)}
  a{color:#0b5bd3}:focus-visible{outline:3px solid #1b6fd8;outline-offset:2px}
  .top{background:var(--navy);color:#fff}
  .top-inner{max-width:1180px;margin:0 auto;padding:0 20px;display:flex;align-items:center;gap:8px;min-height:60px;flex-wrap:wrap}
  .brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;margin-right:18px;font-weight:800;letter-spacing:.04em}
  .brand img{width:32px;height:32px;border-radius:50%;background:#fff}.brand small{display:block;font-weight:600;letter-spacing:0;color:#b9c7da;font-size:12px}
  nav.admin-nav{display:flex;gap:2px;flex-wrap:wrap;flex:1}
  nav.admin-nav a{color:#dce6f4;text-decoration:none;font-weight:600;font-size:14px;padding:8px 11px;border-radius:7px}
  nav.admin-nav a:hover{background:#ffffff14;color:#fff}nav.admin-nav a[aria-current=page]{background:#fff;color:var(--navy)}
  .top-actions{display:flex;gap:10px;align-items:center}.top-actions a{color:#dce6f4;font-size:14px}
  .top-actions button{margin:0;background:transparent;border:1px solid #ffffff55;color:#fff;padding:6px 12px}
  main{max-width:1180px;margin:0 auto;padding:28px 20px 60px}h1{font-size:26px;margin:0 0 18px;letter-spacing:-.02em}h2{font-size:18px;margin:28px 0 10px}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}
  th,td{text-align:left;padding:11px 12px;border-bottom:1px solid #edf0f4;vertical-align:top}tbody tr:hover{background:#fafbfd}
  th{background:#f3f5f9;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}.muted{color:var(--muted);font-size:13px}
  .pill{display:inline-block;padding:3px 9px;border-radius:12px;font-size:12px;font-weight:700;background:#e8ecf1;white-space:nowrap}
  .paid,.delivered{background:#dff4e8;color:#13633f}.pending,.new{background:#fff1d6;color:#7a4b00}.failed,.cancelled{background:#fde2e2;color:#9b1c1c}.dispatched{background:#e1ecff;color:#173f8a}
  form.card,.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:16px}
  label{display:block;font-weight:600;font-size:13px;margin:12px 0 5px}input,select,textarea{font:inherit;padding:9px 11px;border:1px solid #b9c3cf;border-radius:7px;width:100%;background:#fff}
  input:focus,select:focus,textarea:focus{border-color:var(--navy2);outline:2px solid #c9d8ee}
  input[type=checkbox]{width:auto;margin-right:6px}.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
  button{font:inherit;font-weight:700;background:var(--navy);color:#fff;border:0;border-radius:8px;padding:10px 18px;cursor:pointer;margin-top:14px}button:hover{background:var(--navy2)}
  .button-orange{background:var(--orange)}.button-orange:hover{background:#a3470a}
  .notice{padding:11px 14px;border-radius:8px;margin-bottom:18px;background:#dff4e8;color:#13633f}.notice.error{background:#fde2e2;color:#9b1c1c}
  .filters{display:flex;gap:6px;flex-wrap:wrap}.filters a{padding:6px 12px;border-radius:16px;background:#fff;border:1px solid var(--line);text-decoration:none;color:var(--ink);font-size:14px}
  .filters a[aria-current=page]{background:var(--navy);color:#fff;border-color:var(--navy)}
  .inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.inline select{width:auto}.inline button{margin:0}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:28px}
  .stat{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px;text-decoration:none;color:inherit;display:block}
  a.stat:hover{border-color:var(--navy2);box-shadow:0 6px 18px #0b21440f}
  .stat small{display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
  .stat b{display:block;font-size:28px;margin:6px 0 2px;letter-spacing:-.02em}.stat span{font-size:13px;color:var(--muted)}
  .stat.alert{border-left:4px solid var(--orange)}
  .thumb{width:48px;height:48px;object-fit:contain;border-radius:8px;background:#f4f6f8;border:1px solid var(--line);display:block}
  .thumb.empty{display:grid;place-items:center;font-size:10px;color:var(--muted);text-align:center;line-height:1.1}
  .photo-box{border:1px solid var(--line);border-radius:10px;padding:6px 16px 14px;margin:16px 0}.photo-box legend{font-weight:700;font-size:13px;padding:0 6px}
  .photo-row{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}.photo-row>div{flex:1;min-width:220px}
  .photo-preview{width:140px;height:140px;object-fit:contain;border-radius:10px;background:#f4f6f8;border:1px solid var(--line)}
  details summary{cursor:pointer;margin-top:10px}
  @media(max-width:700px){.stats{grid-template-columns:1fr 1fr;gap:10px}.stat{padding:14px}.stat b{font-size:22px}table{display:block;overflow-x:auto;white-space:nowrap}main{padding:20px 14px 48px}.brand small{display:none}}
</style>`

function loginPage({ next = '/admin', error = '', setup = false }: { next?: string; error?: string; setup?: boolean }) {
  return html`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Admin login · Atmonsur Store</title>${STYLE}
<style>
  body{min-height:100vh;display:grid;place-items:center;background:linear-gradient(160deg,#0b2144 0%,#16365f 100%);padding:20px}
  .login{background:#fff;border-radius:16px;padding:32px;width:min(400px,100%);box-shadow:0 24px 60px #0007}
  .login .brand{color:var(--navy);margin:0 0 22px}.login .brand small{color:var(--muted)}
  .login h1{font-size:22px;margin:0 0 4px}.login button{width:100%;margin-top:20px;padding:12px}
</style></head><body>
<main class="login">
  <div class="brand"><img src="/favicon.png" alt="" width="32" height="32"><span>ATMONSUR<small>Store admin</small></span></div>
  ${setup
    ? html`<h1>Admin isn’t set up yet</h1><p class="muted">Add an <b>ADMIN_PASSWORD</b> environment variable (at least 12 characters) on your host, for example in Vercel → Settings → Environment Variables, then redeploy. The username is <b>admin</b> unless you also set <b>ADMIN_USER</b>.</p>`
    : html`<h1>Sign in</h1><p class="muted">Manage orders, products and delivery fees.</p>
  ${error ? html`<p class="notice error" role="alert">${error}</p>` : ''}
  <form method="post" action="/admin/login">
    <input type="hidden" name="next" value="${safeNext(next)}">
    <label for="username">Username</label><input id="username" name="username" autocomplete="username" required autofocus>
    <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
    <button class="button-orange">Sign in</button>
  </form>
  <p class="muted" style="margin-top:18px"><a href="/">← Back to the shop</a></p>`}
</main></body></html>`
}

const NAV: [string, string][] = [['/admin', 'Dashboard'], ['/admin/orders', 'Orders'], ['/admin/products', 'Products'], ['/admin/categories', 'Categories'], ['/admin/delivery', 'Delivery fees'], ['/admin/enquiries', 'Enquiries'], ['/admin/customers', 'Customers']]

const page = (title: string, body: unknown, notice = '') => html`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title} · Atmonsur admin</title>${STYLE}</head><body>
<header class="top"><div class="top-inner">
  <a class="brand" href="/admin"><img src="/favicon.png" alt="" width="32" height="32"><span>ATMONSUR<small>Store admin</small></span></a>
  <nav class="admin-nav" aria-label="Admin">${NAV.map(([href, label]) => html`<a href="${href}">${label}</a>`)}</nav>
  <div class="top-actions"><a href="/" target="_blank" rel="noopener">View shop ↗</a><form method="post" action="/admin/logout"><button>Log out</button></form></div>
</div></header>
<main>${notice ? html`<p class="notice ${notice.startsWith('Error') ? 'error' : ''}" role="status">${notice}</p>` : ''}<h1>${title}</h1>${body}</main>
<script>/* highlight the current section */ for (const a of document.querySelectorAll('.admin-nav a')) if (location.pathname === a.pathname || (a.pathname !== '/admin' && location.pathname.startsWith(a.pathname))) a.setAttribute('aria-current', 'page')</script>
</body></html>`

const back = (path: string, msg: string) => `${path}${path.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}`

// ---- Dashboard ----
admin.get('/', async c => {
  const lagosStart = (unit: 'day' | 'month') => sql`(date_trunc(${unit}, now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')`
  const [s] = await sql`select
      count(*) filter (where fulfilment = 'new' and (status = 'paid' or (payment_method = 'on_delivery' and status = 'pending')))::int as to_fulfil,
      count(*) filter (where fulfilment = 'dispatched' and status <> 'failed')::int as on_the_way,
      coalesce(sum(total_kobo) filter (where status = 'paid' and paid_at >= ${lagosStart('day')}), 0)::bigint as today,
      count(*) filter (where status = 'paid' and paid_at >= ${lagosStart('day')})::int as today_orders,
      coalesce(sum(total_kobo) filter (where status = 'paid' and paid_at >= ${lagosStart('month')}), 0)::bigint as month,
      count(*) filter (where status = 'paid' and paid_at >= ${lagosStart('month')})::int as month_orders,
      coalesce(sum(total_kobo) filter (where payment_method = 'on_delivery' and status = 'pending' and fulfilment <> 'cancelled'), 0)::bigint as to_collect,
      count(*) filter (where payment_method = 'on_delivery' and status = 'pending' and fulfilment <> 'cancelled')::int as to_collect_orders
    from orders`
  const [{ enquiries }] = await sql`select count(*)::int as enquiries from enquiries where not handled`
  const [{ products, drafts }] = await sql`select count(*) filter (where active)::int as products, count(*) filter (where not active)::int as drafts from products`
  const recent = await sql`select * from orders where (status = 'paid' or (payment_method = 'on_delivery' and status = 'pending'))
    and fulfilment in ('new', 'dispatched') order by created_at desc limit 8`
  const stat = (href: string, label: string, value: string, sub: string, alert = false) =>
    html`<a class="stat ${alert ? 'alert' : ''}" href="${href}"><small>${label}</small><b>${value}</b><span>${sub}</span></a>`
  return c.html(page('Dashboard', html`
    ${drafts > 0 ? html`<p class="notice" style="background:#fff4e5;color:#7a4b00"><b>${drafts} product${drafts === 1 ? '' : 's'} hidden from the shop.</b> Open each in <a href="/admin/products">Products</a>, set the pack size, prices and a photo, then tick <i>Show on the website</i>.</p>` : ''}
    <div class="stats">
      ${stat('/admin/orders', 'To fulfil', String(s.to_fulfil), s.to_fulfil === 1 ? 'new order waiting' : 'new orders waiting', s.to_fulfil > 0)}
      ${stat('/admin/orders?status=all', 'On the way', String(s.on_the_way), 'dispatched, not yet delivered')}
      ${stat('/admin/orders?status=paid', 'Sales today', naira(Number(s.today)), `${s.today_orders} paid order${s.today_orders === 1 ? '' : 's'}`)}
      ${stat('/admin/orders?status=paid', 'Sales this month', naira(Number(s.month)), `${s.month_orders} paid order${s.month_orders === 1 ? '' : 's'}`)}
      ${stat('/admin/orders', 'To collect', naira(Number(s.to_collect)), `${s.to_collect_orders} pay-on-delivery order${s.to_collect_orders === 1 ? '' : 's'}`, s.to_collect_orders > 0)}
      ${stat('/admin/enquiries', 'New enquiries', String(enquiries), 'not yet handled', enquiries > 0)}
    </div>
    <h2>Orders needing attention</h2>
    <table><thead><tr><th>Date</th><th>Customer</th><th>Delivery</th><th>Total</th><th>Payment</th><th>Fulfilment</th></tr></thead><tbody>
    ${recent.length ? recent.map(o => html`<tr><td><a href="/admin/orders/${o.reference}">${when(o.created_at)}</a></td><td>${o.customer_name}<br><span class="muted">${o.phone}</span></td><td>${o.delivery_zone_name}</td><td>${naira(o.total_kobo)}</td>
      <td><span class="pill ${o.status}">${o.status === 'pending' ? 'pay on delivery' : o.status}</span></td><td><span class="pill ${o.fulfilment}">${o.fulfilment}</span></td></tr>`)
      : html`<tr><td colspan="6" class="muted">Nothing waiting. New orders will appear here.</td></tr>`}
    </tbody></table>
    <p class="muted" style="margin-top:14px">${products} product${products === 1 ? '' : 's'} on sale · <a href="/admin/products/new">Add a product</a> · <a href="/admin/delivery">Delivery fees</a></p>
  `, c.req.query('msg')))
})

// ---- Orders ----
admin.get('/orders', async c => {
  // "open" = orders to deal with: paid online, or placed to pay on delivery (not cancelled).
  const status = c.req.query('status') ?? 'open'
  const orders = status === 'all' ? await sql`select * from orders order by created_at desc limit 200`
    : status === 'open' ? await sql`select * from orders where (status = 'paid' or (payment_method = 'on_delivery' and status = 'pending'))
        and fulfilment <> 'cancelled' order by created_at desc limit 200`
    : await sql`select * from orders where status = ${status} order by created_at desc limit 200`
  const payLabel = (o: Record<string, any>) => (o.status === 'pending' && o.payment_method === 'on_delivery' ? 'pay on delivery' : o.status)
  return c.html(page('Orders', html`
    <p class="filters">Show: ${[['open', 'To fulfil'], ['paid', 'Paid'], ['pending', 'Unpaid'], ['failed', 'Failed'], ['all', 'All']].map(([s, label]) => html`<a href="?status=${s}" ${s === status ? html`aria-current="page" style="font-weight:700"` : ''}>${label}</a>`)}</p>
    <p class="muted"><b>To fulfil</b> shows orders paid online plus <b>pay on delivery</b> orders. Call pay-on-delivery customers to confirm, collect payment on delivery or pickup, then mark the order paid. <b>Unpaid</b> also lists customers who started PalmPay checkout but didn't pay.</p>
    <table><thead><tr><th>Date</th><th>Reference</th><th>Customer</th><th>Delivery</th><th>Total</th><th>Payment</th><th>Fulfilment</th></tr></thead><tbody>
    ${orders.length ? orders.map(o => html`<tr><td>${when(o.created_at)}</td><td><a href="/admin/orders/${o.reference}">${o.reference}</a></td><td>${o.customer_name}<br><span class="muted">${o.phone}</span></td><td>${o.delivery_zone_name}</td><td>${naira(o.total_kobo)}</td><td><span class="pill ${o.status}">${payLabel(o)}</span></td><td><span class="pill ${o.fulfilment}">${o.fulfilment}</span></td></tr>`) : html`<tr><td colspan="7" class="muted">No orders here yet.</td></tr>`}
    </tbody></table>`, c.req.query('msg')))
})

admin.get('/orders/:reference', async c => {
  const o = await getOrder(c.req.param('reference'))
  if (!o) return c.html(page('Order not found', html`<a href="/admin/orders">Back to orders</a>`), 404)
  return c.html(page(`Order ${o.reference}`, html`
    <div class="card"><p><span class="pill ${o.status}">Payment: ${o.status === 'pending' && o.payment_method === 'on_delivery' ? 'pay on delivery (not paid yet)' : o.status}</span>
      ${o.paid_at ? html`<span class="muted">paid ${when(o.paid_at)} · ${o.payment_method === 'on_delivery' ? 'collected on delivery or pickup' : html`PalmPay order ${o.payment_reference}`}</span>` : ''}</p>
      ${o.payment_method === 'on_delivery' && o.status === 'pending' ? html`<form method="post" action="/admin/orders/${o.reference}/paid" class="inline"><button>Mark as paid (${naira(o.total_kobo)} received)</button></form>` : ''}
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

// Pay-on-delivery orders: the owner records the cash or transfer once it's received.
admin.post('/orders/:reference/paid', async c => {
  const ref = c.req.param('reference')
  const done = await sql`update orders set status = 'paid', paid_at = now()
    where reference = ${ref} and payment_method = 'on_delivery' and status = 'pending' returning id`
  return c.redirect(back(`/admin/orders/${ref}`, done.length ? 'Marked as paid' : 'Error: this order can not be marked paid here'))
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
    <table><thead><tr><th></th><th>Product</th><th>Category</th><th>Retail</th><th>Wholesale</th><th>Shown on site</th></tr></thead><tbody>
    ${products.map(p => html`<tr><td>${p.image_url ? html`<img class="thumb" src="${p.image_url}" alt="" loading="lazy">` : html`<span class="thumb empty" title="No photo yet">No photo</span>`}</td><td><a href="/admin/products/${p.id}">${p.name}</a><br><span class="muted">${p.pack}</span></td><td>${p.category}</td><td>${naira(p.price_kobo)}</td><td>${naira(p.bulk_price_kobo)} <span class="muted">from ${p.bulk_min_qty}</span></td><td>${p.active ? 'Yes' : html`<span class="pill failed">Hidden</span>`}</td></tr>`)}
    </tbody></table>`, c.req.query('msg')))
})

const productForm = async (p: Record<string, any> | null, error = '') => {
  const categories = await sql`select name from categories order by sort, name`
  const v = p ?? { active: true, bulk_min_qty: 5, art_kind: 'pack', color: '#f47820', sort: 0 }
  return page(p?.id ? `Edit ${p.name}` : 'Add a product', html`
    <form class="card" method="post" enctype="multipart/form-data" action="/admin/products${p?.id ? `/${p.id}` : ''}">
      <label for="name">Name</label><input id="name" name="name" required maxlength="120" value="${v.name ?? ''}">
      <div class="row"><div><label for="category">Category</label><select id="category" name="category">${categories.map(c => html`<option ${c.name === v.category ? 'selected' : ''}>${c.name}</option>`)}</select></div>
        <div><label for="pack">Pack size</label><input id="pack" name="pack" required maxlength="80" value="${v.pack ?? ''}" placeholder="75cl × 12 bottles"></div></div>
      <div class="row"><div><label for="price">Retail price (₦)</label><input id="price" name="price" required inputmode="decimal" value="${v.price_kobo ? kobo(v.price_kobo) : v.price ?? ''}"></div>
        <div><label for="bulk_price">Wholesale price (₦)</label><input id="bulk_price" name="bulk_price" required inputmode="decimal" value="${v.bulk_price_kobo ? kobo(v.bulk_price_kobo) : v.bulk_price ?? ''}"></div>
        <div><label for="bulk_min_qty">Wholesale from (packs)</label><input id="bulk_min_qty" name="bulk_min_qty" type="number" min="1" required value="${v.bulk_min_qty}"></div></div>
      <div class="row"><div><label for="badge">Badge (optional)</label><input id="badge" name="badge" maxlength="30" value="${v.badge ?? ''}" placeholder="Bestseller"></div>
        <div><label for="sort">Order on site</label><input id="sort" name="sort" type="number" value="${v.sort}"></div></div>
      <label for="description">Description for the product page (optional)</label><textarea id="description" name="description" rows="4" maxlength="2000" placeholder="What it is, brand, ingredients or uses, storage, carton contents…">${v.description ?? ''}</textarea>
      <fieldset class="photo-box"><legend>Product photo</legend>
        <div class="photo-row">
          <img id="photo-preview" class="photo-preview" alt="" src="${v.image_url ?? ''}" ${v.image_url ? '' : 'hidden'}>
          <div>
            <label for="photo">Upload a photo (JPEG, PNG or WebP)</label>
            <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp">
            <p class="muted" id="photo-note">Tip: a clear photo on a plain light background. Large photos are shrunk automatically.</p>
            ${v.image_url ? html`<label><input type="checkbox" name="remove_photo"> Remove the current photo</label>` : ''}
          </div>
        </div>
        <details ${v.image_url && !ownImage(v.image_url) ? 'open' : ''}><summary class="muted">Or use a photo link instead</summary>
          <label for="image_url">Photo link (https://…)</label><input id="image_url" name="image_url" maxlength="500" value="${v.image_url && !ownImage(v.image_url) ? v.image_url : ''}">
        </details>
        <input type="hidden" name="current_image" value="${v.image_url ?? ''}">
      </fieldset>
      <div class="row"><div><label for="art_kind">Illustration if no photo</label><select id="art_kind" name="art_kind">${ART.map(a => html`<option ${a === v.art_kind ? 'selected' : ''}>${a}</option>`)}</select></div>
        <div><label for="color">Illustration colour</label><input id="color" name="color" type="color" value="${v.color}"></div></div>
      <label><input type="checkbox" name="active" ${v.active ? 'checked' : ''}> Show on the website</label>
      <button>Save product</button></form><p><a href="/admin/products">← All products</a></p>
    <script>
      // Shrink the chosen photo in the browser (max 1200px, JPEG) before upload: faster on mobile data, and small to store.
      const input = document.getElementById('photo'), preview = document.getElementById('photo-preview'), note = document.getElementById('photo-note')
      input.addEventListener('change', async () => {
        const file = input.files[0]
        if (!file) return
        try {
          const bitmap = await createImageBitmap(file)
          const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
          const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) })
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height) // transparent PNGs get a white background
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
          const dt = new DataTransfer()
          dt.items.add(new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
          input.files = dt.files
          note.textContent = 'Ready to upload: ' + canvas.width + ' × ' + canvas.height + ' px, ' + Math.round(blob.size / 1024) + ' KB. Press Save product.'
          preview.src = URL.createObjectURL(blob)
        } catch {
          note.textContent = 'This photo will be uploaded as it is. If it fails, save it as a JPEG first (iPhone HEIC photos are not supported).'
          preview.src = URL.createObjectURL(file)
        }
        preview.hidden = false
      })
    </script>`, error ? `Error: ${error}` : '')
}

admin.get('/products/new', async c => c.html(await productForm(null)))
admin.get('/products/:id{[0-9]+}', async c => {
  const [p] = await sql`select * from products where id = ${Number(c.req.param('id'))}`
  return p ? c.html(await productForm(p, '')) : c.notFound()
})
const saveProduct = async (c: Context, id: number | null) => {
  const form = await c.req.parseBody()
  const current = typeof form.current_image === 'string' ? form.current_image : ''
  // Keep the current uploaded photo unless it's removed, replaced by a new upload, or replaced by a link.
  const fields = { ...form, image_url: form.remove_photo === 'on' ? '' : (form.image_url || (ownImage(current) ? current : '')) }
  const redo = (error: string) => productForm({ ...form, id, image_url: current, active: form.active === 'on' }, error)
  const parsed = parseProductForm(fields)
  if (!parsed.ok) return c.html(await redo(parsed.error), 400)

  const photo = form.photo instanceof File && form.photo.size > 0 ? form.photo : null
  let upload: { mime: string; data: Buffer } | null = null
  if (photo) {
    if (photo.size > MAX_IMAGE_BYTES) return c.html(await redo('That photo is too large (over 3 MB). Try a smaller one.'), 400)
    const data = Buffer.from(await photo.arrayBuffer())
    const mime = imageType(data)
    if (!mime) return c.html(await redo('That file isn’t a JPEG, PNG or WebP photo.'), 400)
    upload = { mime, data }
  }

  const before = id ? (await sql`select image_url from products where id = ${id}`)[0]?.image_url as string | null : null
  await sql.begin(async tx => {
    if (upload) parsed.value.image_url = `/images/${(await tx`insert into images ${tx(upload!)} returning id`)[0].id}`
    if (id) await tx`update products set ${tx(parsed.value)} where id = ${id}`
    else await tx`insert into products ${tx(parsed.value)}`
    // Delete the old uploaded photo once nothing uses it, so the database doesn't fill with replaced photos.
    const old = before && UPLOADED_IMAGE.exec(before)
    if (old && before !== parsed.value.image_url) {
      await tx`delete from images where id = ${Number(old[1])} and not exists (select 1 from products where image_url = ${before})`
    }
  })
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
