export type Category = { name: string; note: string; color: string; art_kind: string }
export type Product = {
  id: number; name: string; category: string; pack: string; price_kobo: number; bulk_price_kobo: number; bulk_min_qty: number
  badge: string | null; image_url: string | null; art_kind: string; color: string; description: string | null
}
export type Zone = { id: string; name: string; fee_kobo: number; needs_address: boolean }
// payments: 'palmpay' once the store's PalmPay keys are set, otherwise customers pay on delivery or pickup.
export type Catalogue = { categories: Category[]; products: Product[]; zones: Zone[]; payments: 'palmpay' | 'on_delivery' }
export type OrderSummary = {
  reference: string; status: 'pending' | 'paid' | 'failed'; payment_method: 'palmpay' | 'on_delivery'; first_name: string; delivery: string
  items: { name: string; pack: string; qty: number; line_total_kobo: number }[]
  subtotal_kobo: number; delivery_fee_kobo: number; total_kobo: number
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new Error('Could not reach the store. Check your internet connection and try again.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.')
  return data as T
}

export type Account = {
  name: string; email: string; phone: string; email_verified: boolean
  address: string | null; city: string | null; delivery_zone: string | null
}
export type PastOrder = {
  reference: string; status: 'pending' | 'paid'; payment_method: 'palmpay' | 'on_delivery'; fulfilment: string; created_at: string; delivery: string; total_kobo: number
  items: { product_id: number | null; name: string; pack: string; qty: number; line_total_kobo: number }[]
}
type WithAccount = { customer: Account }

export const accountApi = {
  me: () => call<{ customer: Account | null }>('/api/account'),
  signup: (body: unknown) => call<WithAccount>('/api/account/signup', body),
  login: (body: unknown) => call<WithAccount>('/api/account/login', body),
  logout: () => call<{ ok: true }>('/api/account/logout', {}),
  forgot: (email: string) => call<{ ok: true }>('/api/account/forgot', { email }),
  reset: (token: string, password: string) => call<WithAccount>('/api/account/reset', { token, password }),
  verify: (token: string) => call<WithAccount>('/api/account/verify', { token }),
  resendVerification: () => call<{ ok: true }>('/api/account/resend-verification', {}),
  profile: (body: unknown) => call<WithAccount>('/api/account/profile', body),
  password: (current: string, password: string) => call<{ ok: true }>('/api/account/password', { current, password }),
  orders: () => call<{ orders: PastOrder[] }>('/api/account/orders'),
}

export const api = {
  catalogue: () => call<Catalogue>('/api/catalogue'),
  checkout: (body: unknown) => call<{ checkout_url: string; reference: string }>('/api/checkout', body),
  order: (reference: string) => call<OrderSummary>(`/api/orders/${encodeURIComponent(reference)}`),
  enquiry: (body: unknown) => call<{ ok: true }>('/api/enquiries', body),
}

export const formatKobo = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`

export const CONTACT = {
  phone: '+234 907 843 2867', phoneHref: 'tel:+2349078432867',
  care: '+234 815 873 6211', careHref: 'tel:+2348158736211',
  email: 'atmonsurmultiglobalresources@gmail.com',
  whatsapp: 'https://wa.me/2349078432867',
  address: 'Iraye Road, opposite Epe Grammar School, Lagos',
}
