export type Category = { name: string; note: string; color: string; art_kind: string }
export type Product = {
  id: number; name: string; category: string; pack: string; price_kobo: number; bulk_price_kobo: number; bulk_min_qty: number
  badge: string | null; image_url: string | null; art_kind: string; color: string
}
export type Zone = { id: string; name: string; fee_kobo: number; needs_address: boolean }
export type Catalogue = { categories: Category[]; products: Product[]; zones: Zone[] }
export type OrderSummary = {
  reference: string; status: 'pending' | 'paid' | 'failed'; first_name: string; delivery: string
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

export const api = {
  catalogue: () => call<Catalogue>('/api/catalogue'),
  checkout: (body: unknown) => call<{ authorization_url: string; reference: string }>('/api/checkout', body),
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
