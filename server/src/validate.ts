// Input validation for requests coming from the public website. Pure functions so they can be unit-tested.

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max + 1) : '')
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE = /^\+?[0-9 ()-]{7,20}$/

// ---- Customer accounts ----

/** Passwords are not trimmed (spaces are allowed); 8–200 characters. */
export function checkPassword(v: unknown): string | null {
  if (typeof v !== 'string' || v.length < 8) return 'Password must be at least 8 characters.'
  if (v.length > 200) return 'Password is too long.'
  return null
}

export type SignupInput = { name: string; email: string; phone: string; password: string }

export function parseSignup(body: unknown): Result<SignupInput> {
  const b = (body ?? {}) as Record<string, unknown>
  const v = { name: str(b.name, 100), email: str(b.email, 200).toLowerCase(), phone: str(b.phone, 20), password: typeof b.password === 'string' ? b.password : '' }
  if (v.name.length < 2 || v.name.length > 100) return { ok: false, error: 'Please enter your full name.' }
  if (!EMAIL.test(v.email) || v.email.length > 200) return { ok: false, error: 'Please enter a valid email address.' }
  if (!PHONE.test(v.phone)) return { ok: false, error: 'Please enter a valid phone number.' }
  const pw = checkPassword(v.password)
  if (pw) return { ok: false, error: pw }
  return { ok: true, value: v }
}

export type ProfileInput = { name: string; phone: string; address: string | null; city: string | null; delivery_zone: string | null }

export function parseProfile(body: unknown): Result<ProfileInput> {
  const b = (body ?? {}) as Record<string, unknown>
  const v = { name: str(b.name, 100), phone: str(b.phone, 20), address: str(b.address, 300) || null, city: str(b.city, 100) || null, delivery_zone: str(b.delivery_zone, 40) || null }
  if (v.name.length < 2 || v.name.length > 100) return { ok: false, error: 'Please enter your full name.' }
  if (!PHONE.test(v.phone)) return { ok: false, error: 'Please enter a valid phone number.' }
  if ((v.address?.length ?? 0) > 300 || (v.city?.length ?? 0) > 100) return { ok: false, error: 'Address is too long.' }
  return { ok: true, value: v }
}

export const normaliseEmail = (v: unknown) => str(v, 200).toLowerCase()

export type CheckoutInput = {
  items: { product_id: number; qty: number }[]
  customer: { name: string; email: string; phone: string; zone: string; address: string; city: string; notes: string }
}

export function parseCheckout(body: unknown): Result<CheckoutInput> {
  const b = (body ?? {}) as Record<string, unknown>
  const c = (b.customer ?? {}) as Record<string, unknown>
  const customer = {
    name: str(c.name, 100), email: str(c.email, 200).toLowerCase(), phone: str(c.phone, 20),
    zone: str(c.zone, 50), address: str(c.address, 300), city: str(c.city, 100), notes: str(c.notes, 500),
  }
  if (customer.name.length < 2 || customer.name.length > 100) return { ok: false, error: 'Please enter your full name.' }
  if (!EMAIL.test(customer.email) || customer.email.length > 200) return { ok: false, error: 'Please enter a valid email address.' }
  if (!PHONE.test(customer.phone)) return { ok: false, error: 'Please enter a valid phone number.' }
  if (!customer.zone) return { ok: false, error: 'Please choose a delivery option.' }
  if (customer.address.length > 300 || customer.city.length > 100 || customer.notes.length > 500) return { ok: false, error: 'Some details are too long.' }

  if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > 50) return { ok: false, error: 'Your cart is empty or too large.' }
  const merged = new Map<number, number>()
  for (const raw of b.items as Record<string, unknown>[]) {
    const id = Number(raw?.product_id), qty = Number(raw?.qty)
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(qty) || qty < 1 || qty > 9999) return { ok: false, error: 'Your cart has an invalid item.' }
    merged.set(id, (merged.get(id) ?? 0) + qty)
  }
  return { ok: true, value: { items: [...merged].map(([product_id, qty]) => ({ product_id, qty })), customer } }
}

export type EnquiryInput = { name: string; phone: string; email: string; subject: string; message: string }

const SUBJECTS = ['Product availability', 'Bulk or wholesale order', 'Delivery', 'Existing order', 'General enquiry']

export function parseEnquiry(body: unknown): Result<EnquiryInput> & { spam?: boolean } {
  const b = (body ?? {}) as Record<string, unknown>
  if (str(b.website, 200)) return { ok: false, error: 'Rejected.', spam: true } // hidden honeypot field humans never fill
  const v = { name: str(b.name, 100), phone: str(b.phone, 20), email: str(b.email, 200).toLowerCase(), subject: str(b.subject, 50), message: str(b.message, 3000) }
  if (v.name.length < 2 || v.name.length > 100) return { ok: false, error: 'Please enter your full name.' }
  if (!PHONE.test(v.phone)) return { ok: false, error: 'Please enter a valid phone number.' }
  if (!EMAIL.test(v.email) || v.email.length > 200) return { ok: false, error: 'Please enter a valid email address.' }
  if (!SUBJECTS.includes(v.subject)) return { ok: false, error: 'Please choose what your enquiry is about.' }
  if (v.message.length < 5 || v.message.length > 3000) return { ok: false, error: 'Please write a message (up to 3000 characters).' }
  return { ok: true, value: v }
}

export const REFERENCE = /^ATM[A-Z0-9]{6,12}[a-f0-9]{16}$/ // see newReference in palmpay.ts

// ---- Admin forms (values arrive as strings from HTML forms) ----

const nairaToKobo = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[₦,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : NaN
}
const ART = ['bottle', 'carton', 'bag', 'pack', 'jar', 'cleaner']
const COLOR = /^#[0-9a-fA-F]{6}$/

export type ProductForm = {
  name: string; category: string; pack: string; price_kobo: number; bulk_price_kobo: number; bulk_min_qty: number
  badge: string | null; image_url: string | null; art_kind: string; color: string; active: boolean; sort: number; description: string | null
}

export function parseProductForm(f: Record<string, unknown>): Result<ProductForm> {
  const v = {
    name: str(f.name, 120), category: str(f.category, 60), pack: str(f.pack, 80),
    price_kobo: nairaToKobo(f.price), bulk_price_kobo: nairaToKobo(f.bulk_price), bulk_min_qty: Number(f.bulk_min_qty),
    badge: str(f.badge, 30) || null, image_url: str(f.image_url, 500) || null,
    art_kind: str(f.art_kind, 20), color: str(f.color, 7), active: f.active === 'on', sort: Number(f.sort || 0),
    description: str(f.description, 2000) || null,
  }
  if (!v.name || v.name.length > 120) return { ok: false, error: 'Name is required (up to 120 characters).' }
  if (!v.category) return { ok: false, error: 'Choose a category.' }
  if (!v.pack || v.pack.length > 80) return { ok: false, error: 'Pack size is required, e.g. "75cl × 12 bottles".' }
  if (Number.isNaN(v.price_kobo)) return { ok: false, error: 'Retail price must be a number above 0.' }
  if (Number.isNaN(v.bulk_price_kobo) || v.bulk_price_kobo > v.price_kobo) return { ok: false, error: 'Wholesale price must be above 0 and not more than the retail price.' }
  if (!Number.isInteger(v.bulk_min_qty) || v.bulk_min_qty < 1) return { ok: false, error: 'Wholesale minimum must be a whole number of 1 or more.' }
  if (v.image_url && !/^https:\/\/\S+$/.test(v.image_url)) return { ok: false, error: 'Photo link must start with https://' }
  if (!ART.includes(v.art_kind)) return { ok: false, error: 'Choose an illustration.' }
  if (!COLOR.test(v.color)) return { ok: false, error: 'Colour must look like #3796df.' }
  if (!Number.isInteger(v.sort)) return { ok: false, error: 'Order must be a whole number.' }
  if ((v.description?.length ?? 0) > 2000) return { ok: false, error: 'Description is too long (up to 2000 characters).' }
  return { ok: true, value: v }
}

export function parseZoneForm(f: Record<string, unknown>): Result<{ id: string; name: string; fee_kobo: number; needs_address: boolean; active: boolean; sort: number }> {
  const fee = String(f.fee ?? '').trim() === '0' ? 0 : nairaToKobo(f.fee)
  const v = { id: str(f.id, 40).toLowerCase(), name: str(f.name, 100), fee_kobo: fee, needs_address: f.needs_address === 'on', active: f.active === 'on', sort: Number(f.sort || 0) }
  if (!/^[a-z0-9-]{2,40}$/.test(v.id)) return { ok: false, error: 'Code must be 2–40 lowercase letters, numbers or dashes.' }
  if (!v.name || v.name.length > 100) return { ok: false, error: 'Name is required.' }
  if (Number.isNaN(v.fee_kobo)) return { ok: false, error: 'Fee must be 0 or more.' }
  if (!Number.isInteger(v.sort)) return { ok: false, error: 'Order must be a whole number.' }
  return { ok: true, value: v }
}

export function parseCategoryForm(f: Record<string, unknown>): Result<{ name: string; note: string; color: string; art_kind: string; sort: number }> {
  const v = { name: str(f.name, 60), note: str(f.note, 60), color: str(f.color, 7), art_kind: str(f.art_kind, 20), sort: Number(f.sort || 0) }
  if (!v.name || v.name.length > 60) return { ok: false, error: 'Category name is required.' }
  if (v.note.length > 60) return { ok: false, error: 'Short description is too long.' }
  if (!COLOR.test(v.color)) return { ok: false, error: 'Colour must look like #e8f3ff.' }
  if (!ART.includes(v.art_kind)) return { ok: false, error: 'Choose an illustration.' }
  if (!Number.isInteger(v.sort)) return { ok: false, error: 'Order must be a whole number.' }
  return { ok: true, value: v }
}
