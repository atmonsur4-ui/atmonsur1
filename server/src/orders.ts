import { sql, type OrderItemRow, type OrderRow } from './db.ts'
import { notifyOwner, naira } from './notify.ts'
import { ORDER_STATUS } from './palmpay.ts'

export async function getOrder(reference: string) {
  const [order] = await sql<OrderRow[]>`select * from orders where reference = ${reference}`
  if (!order) return null
  const items = await sql<OrderItemRow[]>`select * from order_items where order_id = ${order.id} order by id`
  return { ...order, items }
}

/** A PalmPay order as returned by the query API or sent in a payment notification (field names as PalmPay spells them). */
export type PalmPayOrder = { orderId: string; orderNo?: string; orderStatus: number; amount: number; currency: string }

/**
 * Marks an order paid if PalmPay reports it paid (orderStatus 2) for exactly the right amount. Called by both the
 * notification and the order page; the `status = 'pending'` guard makes it happen once, so the owner is emailed once.
 */
export async function settleOrder(tx: PalmPayOrder) {
  const order = await getOrder(tx.orderId)
  if (!order || order.status !== 'pending' || Number(tx.orderStatus) !== ORDER_STATUS.success) return order
  if (Number(tx.amount) !== order.total_kobo || tx.currency !== 'NGN') {
    console.error(`Amount mismatch on ${tx.orderId}: paid ${tx.amount} ${tx.currency}, expected ${order.total_kobo} NGN`)
    await notifyOwner(`CHECK PAYMENT: amount mismatch on order ${tx.orderId}`, `PalmPay reports ${Number(tx.amount) / 100} ${tx.currency}; order total is ${naira(order.total_kobo)}. The order was left unpaid.`)
    return order
  }
  const updated = await sql`update orders set status = 'paid', paid_at = now(), payment_reference = ${tx.orderNo ?? null}
    where id = ${order.id} and status = 'pending' returning id`
  if (updated.length) await notifyNewOrder(order)
  return { ...order, status: updated.length ? ('paid' as const) : order.status }
}

/** Emails the owner a new order: paid online, or placed and awaiting the customer's bank transfer. */
export async function notifyNewOrder(order: NonNullable<Awaited<ReturnType<typeof getOrder>>>) {
  const byTransfer = order.payment_method === 'transfer'
  await notifyOwner(byTransfer ? `New order ${order.reference} (awaiting transfer): ${naira(order.total_kobo)}` : `New paid order ${order.reference}: ${naira(order.total_kobo)}`, [
    `Customer: ${order.customer_name}`, `Phone: ${order.phone}`, `Email: ${order.email}`, `Delivery: ${order.delivery_zone_name}`,
    ...(order.address ? [`Address: ${order.address}, ${order.city ?? ''}`] : []), ...(order.notes ? [`Notes: ${order.notes}`] : []),
    '', ...order.items.map(i => `${i.qty} × ${i.name} (${i.pack}) = ${naira(i.line_total_kobo)}`),
    '', `Subtotal: ${naira(order.subtotal_kobo)}`, `Delivery: ${naira(order.delivery_fee_kobo)}`,
    byTransfer ? `Total: ${naira(order.total_kobo)} (NOT PAID YET: wait for the bank transfer with reference ${order.reference}, then mark the order paid in admin before delivering)` : `Total paid: ${naira(order.total_kobo)}`,
    '', `View in admin: ${process.env.SITE_URL ?? ''}/admin/orders/${order.reference}`,
  ].join('\n'))
}
