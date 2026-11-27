// Customer accounts at /api/account: sign up, log in/out, profile, password reset, email verification, order history.
// Sessions are a random token in an httpOnly cookie; only its sha256 is stored. Guests can still check out.
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sql, type OrderItemRow, type OrderRow } from './db.ts'
import { sendEmail } from './notify.ts'
import { hashPassword, randomToken, sha256, verifyPassword } from './passwords.ts'
import { overLimit, rateLimit } from './rateLimit.ts'
import { checkPassword, normaliseEmail, parseAddress, parseProfile, parseSignup } from './validate.ts'

export type CustomerRow = {
  id: number; email: string; name: string; phone: string; password_hash: string; email_verified_at: Date | null
  address: string | null; city: string | null; delivery_zone: string | null; created_at: Date
}

const COOKIE = 'atm_session'
const SESSION_DAYS = 30
const site = () => process.env.SITE_URL ?? 'http://localhost:3000'

export async function currentCustomer(c: Context): Promise<CustomerRow | null> {
  const token = getCookie(c, COOKIE)
  if (!token) return null
  const [row] = await sql<CustomerRow[]>`select c.* from sessions s join customers c on c.id = s.customer_id
    where s.token_hash = ${sha256(token)} and s.expires_at > now()`
  return row ?? null
}

async function startSession(c: Context, customerId: number) {
  const token = randomToken()
  await sql`delete from sessions where customer_id = ${customerId} and expires_at < now()`
  await sql`insert into sessions ${sql({ token_hash: sha256(token), customer_id: customerId, expires_at: new Date(Date.now() + SESSION_DAYS * 864e5) })}`
  setCookie(c, COOKIE, token, { httpOnly: true, secure: site().startsWith('https://'), sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86400 })
}

const publicCustomer = (c: CustomerRow) => ({
  name: c.name, email: c.email, phone: c.phone, email_verified: Boolean(c.email_verified_at), member_since: c.created_at,
})

async function emailToken(customer: CustomerRow, purpose: 'verify' | 'reset') {
  const token = randomToken()
  const hours = purpose === 'reset' ? 1 : 24 * 7
  await sql`delete from email_tokens where customer_id = ${customer.id} and purpose = ${purpose}`
  await sql`insert into email_tokens ${sql({ token_hash: sha256(token), customer_id: customer.id, purpose, expires_at: new Date(Date.now() + hours * 36e5) })}`
  const link = `${site()}/account/${purpose}?token=${token}`
  return purpose === 'reset'
    ? sendEmail(customer.email, 'Reset your Atmonsur Store password', `Hello ${customer.name},\n\nUse this link within 1 hour to choose a new password:\n${link}\n\nIf you didn't ask for this, you can ignore this email.`)
    : sendEmail(customer.email, 'Confirm your email for Atmonsur Store', `Hello ${customer.name},\n\nPlease confirm your email address:\n${link}\n\nOnce confirmed, any earlier orders you placed with this email will also appear in your account.`)
}

/** Single use: the token is deleted as it is redeemed. */
async function redeemToken(token: unknown, purpose: 'verify' | 'reset') {
  if (typeof token !== 'string' || token.length > 100) return null
  const [row] = await sql<{ customer_id: number }[]>`delete from email_tokens
    where token_hash = ${sha256(token)} and purpose = ${purpose} and expires_at > now() returning customer_id`
  return row?.customer_id ?? null
}

/** The customer has proven they own this inbox, so earlier guest orders placed with it now belong to them. */
async function markVerified(customerId: number) {
  const [c] = await sql<CustomerRow[]>`update customers set email_verified_at = coalesce(email_verified_at, now()) where id = ${customerId} returning *`
  await sql`update orders set customer_id = ${c.id} where customer_id is null and lower(email) = ${c.email}`
  return c
}

type Env = { Variables: { customer: CustomerRow } }
export const accounts = new Hono<Env>()

const signedIn: MiddlewareHandler<Env> = async (c, next) => {
  const customer = await currentCustomer(c)
  if (!customer) return c.json({ error: 'Please log in.' }, 401)
  c.set('customer', customer)
  await next()
}

const body = (c: Context) => c.req.json().catch(() => ({})) as Promise<Record<string, unknown>>

accounts.get('/', async c => {
  c.header('Cache-Control', 'no-store')
  const customer = await currentCustomer(c)
  return c.json({ customer: customer ? publicCustomer(customer) : null })
})

accounts.post('/signup', rateLimit(5), async c => {
  const parsed = parseSignup(await body(c))
  if (!parsed.ok) return c.json({ error: parsed.error }, 400)
  const v = parsed.value
  const [existing] = await sql`select id from customers where email = ${v.email}`
  if (existing) return c.json({ error: 'An account with this email already exists. Log in, or use “Forgot password”.' }, 409)
  const [customer] = await sql<CustomerRow[]>`insert into customers ${sql({ name: v.name, email: v.email, phone: v.phone, password_hash: await hashPassword(v.password) })} returning *`
  await startSession(c, customer.id)
  await emailToken(customer, 'verify')
  return c.json({ customer: publicCustomer(customer) })
})

// Same timing whether or not the email exists, so the login form doesn't reveal who has an account.
const DUMMY_HASH = await hashPassword(randomToken())

accounts.post('/login', rateLimit(10), async c => {
  const b = await body(c)
  const email = normaliseEmail(b.email), password = typeof b.password === 'string' ? b.password : ''
  if (overLimit(`login|${email}`, 8, 15 * 60_000)) return c.json({ error: 'Too many attempts for this account. Wait 15 minutes or reset your password.' }, 429)
  const [customer] = await sql<CustomerRow[]>`select * from customers where email = ${email}`
  const ok = await verifyPassword(password, customer?.password_hash ?? DUMMY_HASH)
  if (!customer || !ok) return c.json({ error: 'Email or password is incorrect.' }, 401)
  await startSession(c, customer.id)
  return c.json({ customer: publicCustomer(customer) })
})

accounts.post('/logout', async c => {
  const token = getCookie(c, COOKIE)
  if (token) await sql`delete from sessions where token_hash = ${sha256(token)}`
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})

accounts.post('/forgot', rateLimit(5), async c => {
  const email = normaliseEmail((await body(c)).email)
  if (!overLimit(`forgot|${email}`, 3, 60 * 60_000)) {
    const [customer] = await sql<CustomerRow[]>`select * from customers where email = ${email}`
    if (customer) await emailToken(customer, 'reset')
  }
  return c.json({ ok: true }) // same answer either way: don't reveal which emails have accounts
})

accounts.post('/reset', rateLimit(10), async c => {
  const b = await body(c)
  const pw = checkPassword(b.password)
  if (pw) return c.json({ error: pw }, 400)
  const customerId = await redeemToken(b.token, 'reset')
  if (!customerId) return c.json({ error: 'This reset link has expired or was already used. Please request a new one.' }, 400)
  await sql`update customers set password_hash = ${await hashPassword(b.password as string)} where id = ${customerId}`
  await sql`delete from sessions where customer_id = ${customerId}` // sign out everywhere else
  const customer = await markVerified(customerId)
  await startSession(c, customerId)
  return c.json({ customer: publicCustomer(customer) })
})

accounts.post('/verify', rateLimit(10), async c => {
  const customerId = await redeemToken((await body(c)).token, 'verify')
  if (!customerId) return c.json({ error: 'This confirmation link has expired or was already used.' }, 400)
  return c.json({ customer: publicCustomer(await markVerified(customerId)) })
})

accounts.post('/resend-verification', signedIn, async c => {
  const customer = c.get('customer')
  if (customer.email_verified_at) return c.json({ ok: true })
  if (overLimit(`verify|${customer.id}`, 3, 60 * 60_000)) return c.json({ error: 'Please wait a while before asking again.' }, 429)
  return c.json({ ok: true, sent: await emailToken(customer, 'verify') })
})

accounts.post('/profile', signedIn, async c => {
  const parsed = parseProfile(await body(c))
  if (!parsed.ok) return c.json({ error: parsed.error }, 400)
  const [customer] = await sql<CustomerRow[]>`update customers set ${sql(parsed.value)} where id = ${c.get('customer').id} returning *`
  return c.json({ customer: publicCustomer(customer) })
})

accounts.post('/password', signedIn, async c => {
  const b = await body(c)
  const customer = c.get('customer')
  if (overLimit(`password|${customer.id}`, 5, 15 * 60_000)) return c.json({ error: 'Too many attempts. Please wait 15 minutes.' }, 429)
  if (!(await verifyPassword(String(b.current ?? ''), customer.password_hash))) return c.json({ error: 'Your current password is incorrect.' }, 400)
  const pw = checkPassword(b.password)
  if (pw) return c.json({ error: pw }, 400)
  await sql`update customers set password_hash = ${await hashPassword(b.password as string)} where id = ${customer.id}`
  await sql`delete from sessions where customer_id = ${customer.id}`
  await startSession(c, customer.id)
  return c.json({ ok: true })
})

accounts.get('/orders', signedIn, async c => {
  c.header('Cache-Control', 'no-store')
  const orders = await sql<OrderRow[]>`select * from orders where customer_id = ${c.get('customer').id} and status <> 'failed' order by created_at desc limit 100`
  const items = orders.length ? await sql<OrderItemRow[]>`select * from order_items where order_id in ${sql(orders.map(o => o.id))} order by id` : []
  return c.json({
    orders: orders.map(o => ({
      reference: o.reference, status: o.status, payment_method: o.payment_method, fulfilment: o.fulfilment, created_at: o.created_at, delivery: o.delivery_zone_name, total_kobo: o.total_kobo,
      items: items.filter(i => i.order_id === o.id).map(i => ({ product_id: i.product_id, name: i.name, pack: i.pack, qty: i.qty, line_total_kobo: i.line_total_kobo })),
    })),
  })
})

// ---- Overview ----
accounts.get('/summary', signedIn, async c => {
  c.header('Cache-Control', 'no-store')
  const id = c.get('customer').id
  const [s] = await sql`select count(*) filter (where status = 'paid' or payment_method = 'transfer')::int as orders,
      coalesce(sum(total_kobo) filter (where status = 'paid'), 0)::bigint as spent from orders where customer_id = ${id} and status <> 'failed'`
  const [last] = await sql`select reference, status, payment_method, fulfilment, created_at, total_kobo from orders
    where customer_id = ${id} and (status = 'paid' or payment_method = 'transfer') order by created_at desc limit 1`
  const [{ addresses }] = await sql`select count(*)::int as addresses from customer_addresses where customer_id = ${id}`
  return c.json({ orders: s.orders, spent_kobo: Number(s.spent), last_order: last ?? null, addresses })
})

// ---- Address book (max 10 per customer) ----
type AddressRow = { id: number; label: string; delivery_zone: string; address: string | null; city: string | null; is_default: boolean }

accounts.get('/addresses', signedIn, async c => {
  c.header('Cache-Control', 'no-store')
  const rows = await sql<AddressRow[]>`select id, label, delivery_zone, address, city, is_default from customer_addresses
    where customer_id = ${c.get('customer').id} order by is_default desc, created_at`
  return c.json({ addresses: rows })
})

async function saveAddress(c: Context<Env>, id: number | null) {
  const customerId = c.get('customer').id
  const b = await body(c)
  const [zone] = await sql`select needs_address from delivery_zones where id = ${String(b.delivery_zone ?? '')} and active`
  if (!zone) return c.json({ error: 'Choose a delivery option.' }, 400)
  const parsed = parseAddress(b, zone.needs_address)
  if (!parsed.ok) return c.json({ error: parsed.error }, 400)
  const v = parsed.value
  const result = await sql.begin(async tx => {
    const [{ n }] = await tx`select count(*)::int as n from customer_addresses where customer_id = ${customerId}`
    if (!id && n >= 10) return 'full'
    const makeDefault = v.is_default || n === 0 || (n === 1 && id !== null)
    if (makeDefault) await tx`update customer_addresses set is_default = false where customer_id = ${customerId}`
    const row = { label: v.label, delivery_zone: v.delivery_zone, address: v.address, city: v.city, is_default: makeDefault }
    const done = id
      ? await tx`update customer_addresses set ${tx(row)} where id = ${id} and customer_id = ${customerId} returning id`
      : await tx`insert into customer_addresses ${tx({ ...row, customer_id: customerId })} returning id`
    return done.length ? 'ok' : 'missing'
  })
  if (result === 'full') return c.json({ error: 'You can save up to 10 addresses. Delete one first.' }, 400)
  if (result === 'missing') return c.json({ error: 'Address not found.' }, 404)
  return c.json({ ok: true })
}
accounts.post('/addresses', signedIn, c => saveAddress(c, null))
accounts.post('/addresses/:id{[0-9]+}', signedIn, c => saveAddress(c, Number(c.req.param('id'))))

accounts.post('/addresses/:id{[0-9]+}/delete', signedIn, async c => {
  const customerId = c.get('customer').id
  await sql.begin(async tx => {
    const [gone] = await tx`delete from customer_addresses where id = ${Number(c.req.param('id'))} and customer_id = ${customerId} returning is_default`
    // keep one default if the default was removed
    if (gone?.is_default) await tx`update customer_addresses set is_default = true where id = (select id from customer_addresses where customer_id = ${customerId} order by created_at limit 1)`
  })
  return c.json({ ok: true })
})

// ---- Favourites ----
accounts.get('/favourites', signedIn, async c => {
  c.header('Cache-Control', 'no-store')
  const rows = await sql<{ product_id: number }[]>`select product_id from customer_favourites where customer_id = ${c.get('customer').id} order by created_at desc`
  return c.json({ product_ids: rows.map(r => r.product_id) })
})

accounts.post('/favourites/:productId{[0-9]+}', signedIn, async c => {
  const customerId = c.get('customer').id, productId = Number(c.req.param('productId'))
  const on = (await body(c)).on === true
  if (on) {
    const [{ n }] = await sql`select count(*)::int as n from customer_favourites where customer_id = ${customerId}`
    if (n >= 200) return c.json({ error: 'You have reached the favourites limit.' }, 400)
    await sql`insert into customer_favourites (customer_id, product_id) select ${customerId}, id from products where id = ${productId} on conflict do nothing`
  } else await sql`delete from customer_favourites where customer_id = ${customerId} and product_id = ${productId}`
  return c.json({ ok: true })
})

// ---- Security ----
accounts.post('/logout-everywhere', signedIn, async c => {
  await sql`delete from sessions where customer_id = ${c.get('customer').id}`
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})

/** Deletes the account (saved addresses, favourites and sessions go with it). Past orders are kept for the shop's records, unlinked. */
accounts.post('/delete', signedIn, async c => {
  const customer = c.get('customer')
  if (overLimit(`delete|${customer.id}`, 5, 15 * 60_000)) return c.json({ error: 'Too many attempts. Please wait 15 minutes.' }, 429)
  if (!(await verifyPassword(String((await body(c)).password ?? ''), customer.password_hash))) return c.json({ error: 'Your password is incorrect.' }, 400)
  await sql`delete from customers where id = ${customer.id}`
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})
