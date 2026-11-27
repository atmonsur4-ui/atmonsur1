import { useEffect, useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { api, formatKobo } from '../lib/api'
import { Link } from '../lib/router'
import { useStore } from '../lib/store'
import { CatalogueStatus } from './Home'

export function Checkout() {
  const { catalogue, lines, subtotal, setCartOpen, account } = useStore()
  const zones = catalogue?.zones ?? []
  const [zoneId, setZoneId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const zone = zones.find(z => z.id === zoneId)
  const online = catalogue?.payments === 'palmpay'
  // Pre-select the signed-in customer's usual delivery option once the account and zones have loaded.
  useEffect(() => {
    if (!zoneId && account?.delivery_zone && zones.some(z => z.id === account.delivery_zone)) setZoneId(account.delivery_zone)
  }, [account, zones]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!catalogue) return <section className="section shell"><CatalogueStatus /></section>
  if (lines.length === 0) return <section className="section shell checkout-empty">
    <h1>Your cart is empty</h1><p>Add some products before checking out.</p><Link to="/shop" className="button primary">Go to the shop <Icon name="arrow" /></Link>
  </section>

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const f = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    setSubmitting(true)
    setError('')
    try {
      const { checkout_url } = await api.checkout({
        items: lines.map(l => ({ product_id: l.product.id, qty: l.qty })),
        customer: { name: f.name, email: f.email, phone: f.phone, zone: zoneId, address: f.address ?? '', city: f.city ?? '', notes: f.notes ?? '' },
      })
      window.location.assign(checkout_url) // PalmPay's checkout page (returns to /order), or /order directly for pay on delivery
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
    }
  }

  const total = subtotal + (zone?.fee_kobo ?? 0)
  return <section className="section shell checkout-layout">
    {/* key: re-mount with the account's saved details once they load */}
    <form className="enquiry-form" onSubmit={submit} aria-labelledby="co-h" key={account?.email ?? 'guest'}>
      <span className="form-label">Checkout</span><h1 id="co-h" className="checkout-title">Your details</h1>
      {account ? <p className="muted mb-4">Signed in as {account.email}. This order will appear in your account.</p>
        : <p className="muted mb-4">Have an account? <Link className="underline" to="/account?next=/checkout">Log in</Link> to fill this in and track your order. Or continue as a guest.</p>}
      <div className="form-grid">
        <label>Full name<input required name="name" autoComplete="name" minLength={2} maxLength={100} defaultValue={account?.name} /></label>
        <label>Phone number<input required name="phone" type="tel" autoComplete="tel" maxLength={20} placeholder="+234" defaultValue={account?.phone} /></label>
      </div>
      <label>Email address<input required name="email" type="email" autoComplete="email" maxLength={200} defaultValue={account?.email} /><small className="field-hint">Your receipt is sent here.</small></label>

      <fieldset className="zones"><legend>Delivery</legend>
        {zones.map(z => <label key={z.id} className="zone"><input type="radio" name="zone" value={z.id} required checked={zoneId === z.id} onChange={() => setZoneId(z.id)} />
          <span>{z.name}</span><b>{z.fee_kobo ? formatKobo(z.fee_kobo) : 'Free'}</b></label>)}
      </fieldset>

      {zone?.needs_address && <>
        <label>Delivery address<input required name="address" autoComplete="street-address" minLength={5} maxLength={300} placeholder="House number, street, area" defaultValue={account?.address ?? ''} /></label>
        <label>Town / city<input required name="city" autoComplete="address-level2" maxLength={100} defaultValue={account?.city ?? ''} /></label>
      </>}
      <label>Order notes (optional)<textarea name="notes" rows={3} maxLength={500} placeholder="Landmark, best time to deliver, etc." /></label>

      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button orange w-full" type="submit" disabled={submitting}>
        {submitting ? (online ? 'Opening secure payment…' : 'Placing your order…') : online ? <>Pay {formatKobo(total)} securely <Icon name="arrow" /></> : <>Place order · {formatKobo(total)} <Icon name="arrow" /></>}
      </button>
      <p className="secure mt-3"><Icon name="shield" size={15} /> {online ? 'You’ll pay on PalmPay’s secure checkout page, with your PalmPay app or by bank transfer.'
        : zone && !zone.needs_address ? 'You pay by cash or bank transfer when you collect your order. We’ll call to confirm.'
        : 'You pay by cash or bank transfer when your order is delivered. We’ll call to confirm before we send it.'}</p>
    </form>

    <aside className="order-summary" aria-labelledby="sum-h">
      <h2 id="sum-h">Order summary</h2>
      <ul>{lines.map(l => <li key={l.product.id}><span>{l.qty} × {l.product.name}<small>{l.product.pack} · {formatKobo(l.unit)} each{l.unit === l.product.bulk_price_kobo ? ' (wholesale)' : ''}</small></span><b>{formatKobo(l.total)}</b></li>)}</ul>
      <div className="sum-line"><span>Subtotal</span><b>{formatKobo(subtotal)}</b></div>
      <div className="sum-line"><span>Delivery</span><b>{zone ? (zone.fee_kobo ? formatKobo(zone.fee_kobo) : 'Free') : 'Choose an option'}</b></div>
      <div className="sum-line total"><span>Total</span><b>{formatKobo(total)}</b></div>
      <button className="text-link" onClick={() => setCartOpen(true)}>Edit cart</button>
    </aside>
  </section>
}
