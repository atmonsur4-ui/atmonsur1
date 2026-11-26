import { sql, type OrderItemRow, type OrderRow } from './db.ts'
import { notifyOwner, naira } from './notify.ts'

export async function paystack(path: string, init?: RequestInit) {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new Error('Set PAYSTACK_SECRET_KEY')
  const res = await fetch(`https://api.paystack.co${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.status) throw new Error(`Paystack ${path} failed: ${res.status} ${body.message ?? ''}`)
  return body.data
}

export async function getOrder(reference: string) {
  const [order] = await sql<OrderRow[]>`select * from orders where reference = ${reference}`
  if (!order) return null
  const items = await sql<OrderItemRow[]>`select * from order_items where order_id = ${order.id} order by id`
  return { ...order, items }
}

type PaystackTx = { id: number; status: string; amount: number; currency: string; reference: string }

/**
 * Marks an order paid if Paystack's transaction matches it exactly. Called by both the webhook and the
 * order page; the `status = 'pending'` guard makes it happen once, so the owner is emailed once.
 */
export async function settleOrder(tx: PaystackTx) {
  const order = await getOrder(tx.reference)
  if (!order || order.status !== 'pending' || tx.status !== 'success') return order
  if (tx.amount !== order.total_kobo || tx.currency !== 'NGN') {
    console.error(`Amount mismatch on ${tx.reference}: paid ${tx.amount} ${tx.currency}, expected ${order.total_kobo} NGN`)
    await notifyOwner(`CHECK PAYMENT: amount mismatch on order ${tx.reference}`, `Paystack reports ${tx.amount / 100} ${tx.currency}; order total is ${naira(order.total_kobo)}. The order was left unpaid.`)
    return order
  }
  const updated = await sql`update orders set status = 'paid', paid_at = now(), paystack_transaction_id = ${String(tx.id)}
    where id = ${order.id} and status = 'pending' returning id`
  if (updated.length) {
    await notifyOwner(`New paid order ${order.reference}: ${naira(order.total_kobo)}`, [
      `Customer: ${order.customer_name}`, `Phone: ${order.phone}`, `Email: ${order.email}`, `Delivery: ${order.delivery_zone_name}`,
      ...(order.address ? [`Address: ${order.address}, ${order.city ?? ''}`] : []), ...(order.notes ? [`Notes: ${order.notes}`] : []),
      '', ...order.items.map(i => `${i.qty} × ${i.name} (${i.pack}) = ${naira(i.line_total_kobo)}`),
      '', `Subtotal: ${naira(order.subtotal_kobo)}`, `Delivery: ${naira(order.delivery_fee_kobo)}`, `Total paid: ${naira(order.total_kobo)}`,
      '', `View in admin: ${process.env.SITE_URL ?? ''}/admin/orders/${order.reference}`,
    ].join('\n'))
  }
  return { ...order, status: updated.length ? ('paid' as const) : order.status }
}
