import { useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { api, formatKobo } from '../lib/api'
import { Link } from '../lib/router'
import { useStore } from '../lib/store'
import { CatalogueStatus } from './Home'

export function Checkout() {
  const { catalogue, lines, subtotal, setCartOpen } = useStore()
  const zones = catalogue?.zones ?? []
  const [zoneId, setZoneId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const zone = zones.find(z => z.id === zoneId)

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
      const { authorization_url } = await api.checkout({
        items: lines.map(l => ({ product_id: l.product.id, qty: l.qty })),
        customer: { name: f.name, email: f.email, phone: f.phone, zone: zoneId, address: f.address ?? '', city: f.city ?? '', notes: f.notes ?? '' },
      })
      window.location.assign(authorization_url) // Paystack's secure payment page; it returns to /order when done
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
    }
  }

  const total = subtotal + (zone?.fee_kobo ?? 0)
  return <section className="section shell checkout-layout">
    <form className="enquiry-form" onSubmit={submit} aria-labelledby="co-h">
      <span className="form-label">Checkout</span><h1 id="co-h" className="checkout-title">Your details</h1>
      <div className="form-grid">
        <label>Full name<input required name="name" autoComplete="name" minLength={2} maxLength={100} /></label>
        <label>Phone number<input required name="phone" type="tel" autoComplete="tel" maxLength={20} placeholder="+234" /></label>
      </div>
      <label>Email address<input required name="email" type="email" autoComplete="email" maxLength={200} /><small className="field-hint">Your receipt is sent here.</small></label>

      <fieldset className="zones"><legend>Delivery</legend>
        {zones.map(z => <label key={z.id} className="zone"><input type="radio" name="zone" value={z.id} required checked={zoneId === z.id} onChange={() => setZoneId(z.id)} />
          <span>{z.name}</span><b>{z.fee_kobo ? formatKobo(z.fee_kobo) : 'Free'}</b></label>)}
      </fieldset>

      {zone?.needs_address && <>
        <label>Delivery address<input required name="address" autoComplete="street-address" minLength={5} maxLength={300} placeholder="House number, street, area" /></label>
        <label>Town / city<input required name="city" autoComplete="address-level2" maxLength={100} /></label>
      </>}
      <label>Order notes (optional)<textarea name="notes" rows={3} maxLength={500} placeholder="Landmark, best time to deliver, etc." /></label>

      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button orange w-full" type="submit" disabled={submitting}>
        {submitting ? 'Opening secure payment…' : <>Pay {formatKobo(total)} securely <Icon name="arrow" /></>}
      </button>
      <p className="secure mt-3"><Icon name="shield" size={15} /> You’ll pay on Paystack’s secure page by card, bank transfer or USSD.</p>
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
