// Customer accounts at /api/account: sign up, log in/out, profile, password reset, email verification, order history.
// Sessions are a random token in an httpOnly cookie; only its sha256 is stored. Guests can still check out.
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sql, type OrderItemRow, type OrderRow } from './db.ts'
import { sendEmail } from './notify.ts'
import { hashPassword, randomToken, sha256, verifyPassword } from './passwords.ts'
import { overLimit, rateLimit } from './rateLimit.ts'
import { checkPassword, normaliseEmail, parseProfile, parseSignup } from './validate.ts'

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
  name: c.name, email: c.email, phone: c.phone, email_verified: Boolean(c.email_verified_at),
  address: c.address, city: c.city, delivery_zone: c.delivery_zone,
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
      reference: o.reference, status: o.status, fulfilment: o.fulfilment, created_at: o.created_at, delivery: o.delivery_zone_name, total_kobo: o.total_kobo,
      items: items.filter(i => i.order_id === o.id).map(i => ({ product_id: i.product_id, name: i.name, pack: i.pack, qty: i.qty, line_total_kobo: i.line_total_kobo })),
    })),
  })
})
