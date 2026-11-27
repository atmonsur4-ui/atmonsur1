import { useEffect, useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { accountApi, api, formatKobo, type SavedAddress } from '../lib/api'
import { Link } from '../lib/router'
import { useStore } from '../lib/store'
import { CatalogueStatus } from './Home'

const GUEST_KEY = 'atmonsur-guest-checkout'

export function Checkout() {
  const { catalogue, lines, subtotal, setCartOpen, account, accountLoaded } = useStore()
  const zones = catalogue?.zones ?? []
  const [zoneId, setZoneId] = useState('')
  const [saved, setSaved] = useState<SavedAddress[]>([])
  const [addressId, setAddressId] = useState<number | null>(null)
  const [guest, setGuest] = useState(() => sessionStorage.getItem(GUEST_KEY) === '1')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const zone = zones.find(z => z.id === zoneId)
  const chosen = saved.find(a => a.id === addressId)
  const online = catalogue?.payments === 'palmpay'

  // Signed in: load the address book and start from the default address.
  useEffect(() => {
    if (!account) return setSaved([])
    accountApi.addresses().then(r => {
      setSaved(r.addresses)
      const d = r.addresses.find(a => a.is_default)
      if (d) { setAddressId(d.id); setZoneId(d.delivery_zone) }
    }, () => {})
  }, [account?.email]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!catalogue) return <section className="section shell"><CatalogueStatus /></section>
  if (lines.length === 0) return <section className="section shell checkout-empty">
    <h1>Your cart is empty</h1><p>Add some products before checking out.</p><Link to="/shop" className="button primary">Go to the shop <Icon name="arrow" /></Link>
  </section>

  const total = subtotal + (zone?.fee_kobo ?? 0)
  const summary = <aside className="order-summary" aria-labelledby="sum-h">
    <h2 id="sum-h">Order summary</h2>
    <ul>{lines.map(l => <li key={l.product.id}><span>{l.qty} × {l.product.name}<small>{l.product.pack} · {formatKobo(l.unit)} each{l.unit === l.product.bulk_price_kobo && l.product.bulk_price_kobo < l.product.price_kobo ? ' (bulk price)' : ''}</small></span><b>{formatKobo(l.total)}</b></li>)}</ul>
    <div className="sum-line"><span>Subtotal</span><b>{formatKobo(subtotal)}</b></div>
    <div className="sum-line"><span>Delivery</span><b>{zone ? (zone.fee_kobo ? formatKobo(zone.fee_kobo) : 'Free') : 'Choose an option'}</b></div>
    <div className="sum-line total"><span>Total</span><b>{formatKobo(total)}</b></div>
    <button className="text-link" onClick={() => setCartOpen(true)}>Edit cart</button>
  </aside>

  // Step 1 for shoppers who aren't signed in: guest or sign in.
  if (accountLoaded && !account && !guest) return <section className="section shell checkout-layout">
    <div className="checkout-choice">
      <span className="form-label">Checkout</span><h1 className="checkout-title">How would you like to check out?</h1>
      <button className="choice-card" onClick={() => { sessionStorage.setItem(GUEST_KEY, '1'); setGuest(true) }}>
        <Icon name="cart" size={24} /><span><b>Continue as guest</b><small>No account needed. Just your name, phone and delivery details.</small></span><Icon name="arrow" />
      </button>
      <Link className="choice-card" to="/account?next=/checkout">
        <Icon name="user" size={24} /><span><b>Sign in or create an account</b><small>Use your saved addresses, track this order and reorder in one tap.</small></span><Icon name="arrow" />
      </Link>
    </div>
    {summary}
  </section>

  const pickAddress = (id: number | null) => {
    setAddressId(id)
    const a = saved.find(x => x.id === id)
    if (a) setZoneId(a.delivery_zone)
  }

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
      sessionStorage.removeItem(GUEST_KEY)
      window.location.assign(checkout_url) // PalmPay's checkout page (returns to /order), or /order directly for bank transfer
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
    }
  }

  return <section className="section shell checkout-layout">
    {/* key: re-mount with the account's details once they load */}
    <form className="enquiry-form" onSubmit={submit} aria-labelledby="co-h" key={account?.email ?? 'guest'}>
      <span className="form-label">Checkout</span><h1 id="co-h" className="checkout-title">Your details</h1>
      {account ? <p className="muted mb-4">Signed in as {account.email}. This order will appear in your account.</p>
        : <p className="muted mb-4">Checking out as a guest. <button type="button" className="underline" onClick={() => { sessionStorage.removeItem(GUEST_KEY); setGuest(false) }}>Sign in instead</button></p>}
      <div className="form-grid">
        <label>Full name<input required name="name" autoComplete="name" minLength={2} maxLength={100} defaultValue={account?.name} /></label>
        <label>Phone number<input required name="phone" type="tel" autoComplete="tel" maxLength={20} placeholder="+234" defaultValue={account?.phone} /></label>
      </div>
      <label>Email address<input required name="email" type="email" autoComplete="email" maxLength={200} defaultValue={account?.email} /><small className="field-hint">Your order confirmation is sent here.</small></label>

      {saved.length > 0 && <fieldset className="zones"><legend>Your saved addresses</legend>
        {saved.map(a => <label key={a.id} className="zone"><input type="radio" name="saved" checked={addressId === a.id} onChange={() => pickAddress(a.id)} />
          <span>{a.label}<small className="block muted">{a.address ? `${a.address}, ${a.city}` : zones.find(z => z.id === a.delivery_zone)?.name}</small></span></label>)}
        <label className="zone"><input type="radio" name="saved" checked={addressId === null} onChange={() => pickAddress(null)} /><span>Use a different address</span></label>
      </fieldset>}

      {!chosen && <fieldset className="zones"><legend>Delivery</legend>
        {zones.map(z => <label key={z.id} className="zone"><input type="radio" name="zone" value={z.id} required checked={zoneId === z.id} onChange={() => setZoneId(z.id)} />
          <span>{z.name}</span><b>{z.fee_kobo ? formatKobo(z.fee_kobo) : 'Free'}</b></label>)}
      </fieldset>}

      {zone?.needs_address && (chosen
        ? <><input type="hidden" name="address" value={chosen.address ?? ''} /><input type="hidden" name="city" value={chosen.city ?? ''} /></>
        : <div key="new-address">
          <label>Delivery address<input required name="address" autoComplete="street-address" minLength={5} maxLength={300} placeholder="House number, street, area" /></label>
          <label>Town / city<input required name="city" autoComplete="address-level2" maxLength={100} /></label>
          {account && <small className="field-hint">We’ll save this to your addresses for next time.</small>}
        </div>)}
      <label>Order notes (optional)<textarea name="notes" rows={3} maxLength={500} placeholder="Landmark, best time to deliver, etc." /></label>

      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button orange w-full" type="submit" disabled={submitting || !zoneId}>
        {submitting ? (online ? 'Opening secure payment…' : 'Placing your order…') : online ? <>Pay {formatKobo(total)} securely <Icon name="arrow" /></> : <>Place order · {formatKobo(total)} <Icon name="arrow" /></>}
      </button>
      <p className="secure mt-3"><Icon name="shield" size={15} /> {online ? 'You’ll pay on PalmPay’s secure checkout page, with your PalmPay app or by bank transfer.'
        : `Next, you’ll see our bank details. Transfer the total and we’ll ${zone && !zone.needs_address ? 'prepare your pickup' : 'deliver'} once your payment is confirmed.`}</p>
    </form>
    {summary}
  </section>
}
