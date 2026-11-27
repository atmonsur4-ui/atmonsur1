import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { api, CONTACT, formatKobo, type OrderSummary } from '../lib/api'
import { Link, useLocation } from '../lib/router'
import { useStore } from '../lib/store'

// PalmPay sends the customer back here (our callBackUrl): /order?reference=ATM...
export function Order() {
  const { query } = useLocation()
  const reference = query.get('reference') ?? ''
  const { clearCart, account } = useStore()
  const [order, setOrder] = useState<OrderSummary | null>(null)
  const [error, setError] = useState('')
  const [checks, setChecks] = useState(0)

  useEffect(() => {
    if (!reference) return setError('Order not found.')
    setError('')
    api.order(reference).then(o => {
      setOrder(o)
      // Empty the cart once per placed order, so revisiting this page later doesn't wipe a new cart.
      if ((o.status === 'paid' || (o.status === 'pending' && o.payment_method === 'transfer')) && localStorage.getItem('atmonsur-cleared') !== o.reference) {
        clearCart()
        localStorage.setItem('atmonsur-cleared', o.reference)
      }
    }, e => setError(e.message))
  }, [reference, checks]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <section className="section shell checkout-empty"><h1>We couldn’t load this order</h1><p>{error}</p>
    <p>If you’ve paid and see this, call us on <a className="underline" href={CONTACT.phoneHref}>{CONTACT.phone}</a> with your payment receipt.</p></section>
  if (!order) return <section className="section shell checkout-empty" role="status"><h1>Checking your payment…</h1></section>

  const paid = order.status === 'paid'
  const pickup = order.delivery.toLowerCase().includes('pick')
  const awaitingTransfer = order.payment_method === 'transfer' && order.status === 'pending'
  return <section className="section shell order-page">
    <div className={`order-banner ${paid ? 'paid' : 'unpaid'}`} role="status">
      {awaitingTransfer ? <><h1>Thank you, {order.first_name}! Now please pay by bank transfer.</h1>
        <p>Your order is placed. Transfer <b>{formatKobo(order.total_kobo)}</b> using the details below. We’ll confirm your payment and then {pickup ? 'prepare your pickup' : 'arrange delivery'}.</p>
        <TransferDetails amount={order.total_kobo} reference={order.reference} /></>
      : paid ? <><h1>Thank you, {order.first_name}! Your order is confirmed.</h1>
        <p>{order.payment_method === 'transfer' ? `Your transfer has been received. We’ll call you to arrange ${pickup ? 'your pickup' : 'delivery'}.` : `We’ve received your payment and will call you to arrange ${pickup ? 'your pickup' : 'delivery'}.`}</p></>
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
    <p className="flex gap-6 flex-wrap"><Link to="/shop" className="text-link">Continue shopping <Icon name="arrow" size={17} /></Link>
      {account ? <Link to="/account" className="text-link">All your orders</Link> : paid && <Link to="/account?mode=signup" className="text-link">Create an account to track future orders</Link>}</p>
  </section>
}

/** Bank details for paying a transfer order, with copy buttons (the reference must go in the transfer description). */
function TransferDetails({ amount, reference }: { amount: number; reference: string }) {
  const { catalogue } = useStore()
  const [copied, setCopied] = useState('')
  const bank = catalogue?.bank
  const copy = (label: string, value: string) => navigator.clipboard?.writeText(value).then(() => setCopied(label), () => {})
  if (!bank) return <p className="transfer-missing">We’ll call you shortly on the number you gave with our bank details. You can also call us on <a className="underline" href={CONTACT.phoneHref}>{CONTACT.phone}</a>.</p>
  const rows: [string, string, boolean][] = [['Bank', bank.name, false], ['Account number', bank.account_number, true], ['Account name', bank.account_name, false],
    ['Amount', formatKobo(amount), false], ['Description / narration', reference, true]]
  return <div className="transfer-box">
    <dl>{rows.map(([label, value, canCopy]) => <div key={label}><dt>{label}</dt><dd><b>{value}</b>
      {canCopy && <button type="button" className="copy-btn" onClick={() => copy(label, value)}>{copied === label ? 'Copied ✓' : 'Copy'}</button>}</dd></div>)}</dl>
    <p className="muted">Please put <b>{reference}</b> as the transfer description so we can match your payment. Keep your bank receipt until your order arrives.</p>
  </div>
}
