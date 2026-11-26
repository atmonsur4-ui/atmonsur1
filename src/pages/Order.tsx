import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { api, CONTACT, formatKobo, type OrderSummary } from '../lib/api'
import { Link, useLocation } from '../lib/router'
import { useStore } from '../lib/store'

// Paystack sends the customer back here: /order?reference=ATM-...
export function Order() {
  const { query } = useLocation()
  const reference = query.get('reference') ?? query.get('trxref') ?? ''
  const { clearCart } = useStore()
  const [order, setOrder] = useState<OrderSummary | null>(null)
  const [error, setError] = useState('')
  const [checks, setChecks] = useState(0)

  useEffect(() => {
    if (!reference) return setError('Order not found.')
    setError('')
    api.order(reference).then(o => {
      setOrder(o)
      // Empty the cart once per paid order, so revisiting this page later doesn't wipe a new cart.
      if (o.status === 'paid' && localStorage.getItem('atmonsur-cleared') !== o.reference) {
        clearCart()
        localStorage.setItem('atmonsur-cleared', o.reference)
      }
    }, e => setError(e.message))
  }, [reference, checks]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <section className="section shell checkout-empty"><h1>We couldn’t load this order</h1><p>{error}</p>
    <p>If you’ve paid and see this, call us on <a className="underline" href={CONTACT.phoneHref}>{CONTACT.phone}</a> with your payment receipt.</p></section>
  if (!order) return <section className="section shell checkout-empty" role="status"><h1>Checking your payment…</h1></section>

  const paid = order.status === 'paid'
  return <section className="section shell order-page">
    <div className={`order-banner ${paid ? 'paid' : 'unpaid'}`} role="status">
      {paid ? <><h1>Thank you, {order.first_name}! Your order is confirmed.</h1>
        <p>We’ve received your payment and will call you to arrange {order.delivery.toLowerCase().includes('pick') ? 'your pickup' : 'delivery'}. Paystack has emailed you a receipt.</p></>
        : <><h1>{order.status === 'failed' ? 'Payment could not be started' : 'We haven’t received your payment yet'}</h1>
          <p>Your cart has been kept. If you’ve just paid, wait a moment and check again.</p>
          <div className="hero-ctas"><button className="button primary" onClick={() => setChecks(c => c + 1)}>Check again</button><Link to="/checkout" className="button secondary">Back to checkout</Link></div></>}
      <p className="muted">Order reference: <b>{order.reference}</b></p>
    </div>
    <div className="order-summary">
      <h2>Order details</h2>
      <ul>{order.items.map(i => <li key={i.name}><span>{i.qty} × {i.name}<small>{i.pack}</small></span><b>{formatKobo(i.line_total_kobo)}</b></li>)}</ul>
      <div className="sum-line"><span>Subtotal</span><b>{formatKobo(order.subtotal_kobo)}</b></div>
      <div className="sum-line"><span>{order.delivery}</span><b>{order.delivery_fee_kobo ? formatKobo(order.delivery_fee_kobo) : 'Free'}</b></div>
      <div className="sum-line total"><span>Total</span><b>{formatKobo(order.total_kobo)}</b></div>
    </div>
    <p><Link to="/shop" className="text-link">Continue shopping <Icon name="arrow" size={17} /></Link></p>
  </section>
}
