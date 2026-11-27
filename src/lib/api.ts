export type Category = { name: string; note: string; color: string; art_kind: string }
export type Product = {
  id: number; name: string; category: string; pack: string; price_kobo: number; bulk_price_kobo: number; bulk_min_qty: number
  badge: string | null; image_url: string | null; art_kind: string; color: string; description: string | null
}
export type Zone = { id: string; name: string; fee_kobo: number; needs_address: boolean }
// payments: 'palmpay' once the store's PalmPay keys are set; otherwise customers pay by bank transfer before delivery.
export type Bank = { name: string; account_number: string; account_name: string }
export type Catalogue = { categories: Category[]; products: Product[]; zones: Zone[]; payments: 'palmpay' | 'transfer'; bank: Bank | null }
export type OrderSummary = {
  reference: string; status: 'pending' | 'paid' | 'failed'; payment_method: 'palmpay' | 'transfer'; first_name: string; delivery: string
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

export type Account = { name: string; email: string; phone: string; email_verified: boolean; member_since: string }
export type SavedAddress = { id: number; label: string; delivery_zone: string; address: string | null; city: string | null; is_default: boolean }
export type AccountSummary = {
  orders: number; spent_kobo: number; addresses: number
  last_order: { reference: string; status: string; payment_method: string; fulfilment: string; created_at: string; total_kobo: number } | null
}
export type PastOrder = {
  reference: string; status: 'pending' | 'paid'; payment_method: 'palmpay' | 'transfer'; fulfilment: string; created_at: string; delivery: string; total_kobo: number
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
  summary: () => call<AccountSummary>('/api/account/summary'),
  addresses: () => call<{ addresses: SavedAddress[] }>('/api/account/addresses'),
  saveAddress: (body: unknown, id?: number) => call<{ ok: true }>(id ? `/api/account/addresses/${id}` : '/api/account/addresses', body),
  deleteAddress: (id: number) => call<{ ok: true }>(`/api/account/addresses/${id}/delete`, {}),
  favourites: () => call<{ product_ids: number[] }>('/api/account/favourites'),
  setFavourite: (productId: number, on: boolean) => call<{ ok: true }>(`/api/account/favourites/${productId}`, { on }),
  logoutEverywhere: () => call<{ ok: true }>('/api/account/logout-everywhere', {}),
  deleteAccount: (password: string) => call<{ ok: true }>('/api/account/delete', { password }),
}

export const api = {
  catalogue: () => call<Catalogue>('/api/catalogue'),
  checkout: (body: unknown) => call<{ checkout_url: string; reference: string }>('/api/checkout', body),
  order: (reference: string) => call<OrderSummary>(`/api/orders/${encodeURIComponent(reference)}`),
  enquiry: (body: unknown) => call<{ ok: true }>('/api/enquiries', body),
  wholesaleQuote: (body: unknown) => call<{ ok: true }>('/api/wholesale-quote', body),
}

export const formatKobo = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`

export const CONTACT = {
  phone: '+234 907 843 2867', phoneHref: 'tel:+2349078432867',
  care: '+234 815 873 6211', careHref: 'tel:+2348158736211',
  email: 'atmonsurmultiglobalresources@gmail.com',
  whatsapp: 'https://wa.me/2349078432867',
  address: 'Iraye Road, opposite Epe Grammar School, Lagos',
}
