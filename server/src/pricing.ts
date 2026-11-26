// Shared by the website (display) and the checkout function (what the customer is actually charged).
export type Priced = { price_kobo: number; bulk_price_kobo: number; bulk_min_qty: number }

/** Wholesale price applies per product once the quantity reaches that product's minimum. */
export const unitPrice = (p: Priced, qty: number) => (qty >= p.bulk_min_qty ? p.bulk_price_kobo : p.price_kobo)

export const lineTotal = (p: Priced, qty: number) => unitPrice(p, qty) * qty
