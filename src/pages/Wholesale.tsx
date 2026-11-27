import { useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { ProductImage } from '../components/Product'
import { api, CONTACT, formatKobo, type Product } from '../lib/api'
import { Link } from '../lib/router'
import { useStore } from '../lib/store'
import { lineTotal, unitPrice } from '../../server/src/pricing.ts'
import { productPath } from '../../server/src/slug.ts'
import { CatalogueStatus } from './Home'

const SIZES = [
  ['1 pallet', 'One pallet of a product'], ['2 pallets', 'Two pallets'], ['3 pallets', 'Three pallets'],
  ['Half truck', 'Mixed or single products'], ['Full truck', 'Our largest supply'],
] as const

function BulkRow({ product: p }: { product: Product }) {
  const { addQty } = useStore()
  const [qty, setQty] = useState(p.bulk_min_qty)
  const change = (n: number) => setQty(Math.max(1, Math.min(9999, Math.floor(n) || 1)))
  const saving = p.price_kobo - p.bulk_price_kobo
  const pct = Math.round((saving / p.price_kobo) * 100)
  const unit = unitPrice(p, qty)
  return <li className="bulk-row">
    <Link to={productPath(p)} className="bulk-product">
      <span className="bulk-thumb"><ProductImage product={p} /></span>
      <span><b>{p.name}</b><small>{p.pack}</small></span>
    </Link>
    <div className="bulk-prices">
      <span><small>Price</small>{formatKobo(p.price_kobo)}</span>
      <span className="bulk-price"><small>Bulk price</small>{formatKobo(p.bulk_price_kobo)}</span>
      <span><small>Bulk from</small>{p.bulk_min_qty}</span>
      <span className="bulk-save"><small>You save</small>{saving > 0 ? `${formatKobo(saving)} each (${pct}%)` : '—'}</span>
    </div>
    <div className="bulk-buy">
      <div className="qty qty-lg">
        <button onClick={() => change(qty - 1)} aria-label={`One less ${p.name}`}><Icon name="minus" size={16} /></button>
        <input aria-label={`Quantity of ${p.name}`} inputMode="numeric" value={qty} onChange={e => change(parseInt(e.target.value, 10))} />
        <button onClick={() => change(qty + 1)} aria-label={`One more ${p.name}`}><Icon name="plus" size={16} /></button>
      </div>
      <button className="button primary" onClick={() => addQty(p, qty)}>Add · {formatKobo(lineTotal(p, qty))}</button>
      <small className={qty >= p.bulk_min_qty ? 'bulk-ok' : 'bulk-short'}>
        {qty >= p.bulk_min_qty ? `Bulk price applied: ${formatKobo(unit)} each` : `${p.bulk_min_qty - qty} more for the bulk price`}
      </small>
    </div>
  </li>
}

function QuoteForm() {
  const [state, setState] = useState<{ status: 'idle' | 'sending' | 'sent' | 'error'; message?: string }>({ status: 'idle' })
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    setState({ status: 'sending' })
    try {
      await api.wholesaleQuote(Object.fromEntries(new FormData(form)))
      form.reset()
      setState({ status: 'sent' })
    } catch (err) {
      setState({ status: 'error', message: (err as Error).message })
    }
  }
  return <form className="enquiry-form quote-form" onSubmit={submit} aria-labelledby="quote-h">
    <span className="form-label">Wholesale quote</span><h3 id="quote-h">Request pallet or truck prices</h3>
    <fieldset className="size-options"><legend>Order size</legend>
      {SIZES.map(([size, note], i) => <label key={size} className="size-option">
        <input type="radio" name="size" value={size} required defaultChecked={i === 0} /><span><b>{size}</b><small>{note}</small></span>
      </label>)}
    </fieldset>
    <label>Products and quantities<textarea name="products" required rows={4} maxLength={2000} placeholder={'e.g. Pepsi 50cl – 1 pallet\nBigi Cola 35cl – 1 pallet\nHypo Bleach – 200 cartons'} /></label>
    <div className="form-grid">
      <label>Your name<input name="name" required autoComplete="name" maxLength={100} /></label>
      <label>Business name (optional)<input name="business" autoComplete="organization" maxLength={120} /></label>
      <label>Phone number<input name="phone" type="tel" required autoComplete="tel" maxLength={20} placeholder="+234" /></label>
      <label>Email address<input name="email" type="email" required autoComplete="email" maxLength={200} /></label>
    </div>
    <label>Delivery location<input name="location" required maxLength={200} placeholder="Town / area, state" /></label>
    <label>Anything else? (optional)<textarea name="notes" rows={3} maxLength={1000} placeholder="Delivery date, offloading, payment terms…" /></label>
    <label className="honeypot" aria-hidden="true">Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
    <button className="button orange w-full" disabled={state.status === 'sending'}>{state.status === 'sending' ? 'Sending…' : <>Request a quote <Icon name="arrow" /></>}</button>
    <div role="status" aria-live="polite">
      {state.status === 'sent' && <p className="form-success">Thank you. Our team will call you with prices and delivery details, usually within one working day. For anything urgent, call {CONTACT.phone}.</p>}
      {state.status === 'error' && <p className="form-error">{state.message}</p>}
    </div>
  </form>
}

export function Wholesale() {
  const { catalogue } = useStore()
  const products = (catalogue?.products ?? []).filter(p => p.bulk_price_kobo < p.price_kobo)
  return <>
    <section className="contact-hero"><div className="shell">
      <span className="kicker light">For shops, hotels, offices and distributors</span>
      <h1>Bulk &amp; wholesale</h1>
      <p>Lower prices for bigger orders, from a few cartons up to a full truck.</p>
      <div className="hero-ctas"><a href="#bulk" className="button orange">Bulk prices <Icon name="arrow" /></a><a href="#quote" className="button secondary">Pallet &amp; truck quote</a></div>
    </div></section>

    <section className="section shell" aria-labelledby="how-h">
      <h2 id="how-h" className="sr-only">How we sell</h2>
      <ol className="how-steps">
        <li><span>1</span><b>Rolls, cartons &amp; packs</b><p>We sell by the roll, carton or pack, not single sachets or pieces. Every price on this site is per roll, carton or pack.</p></li>
        <li><span>2</span><b>Bulk buyer prices</b><p>Each product has a bulk price that applies automatically once you order its minimum quantity: from 5 up to 77 for drinks. No account or application needed.</p></li>
        <li><span>3</span><b>Wholesale by pallet or truck</b><p>For 1–3 pallets, a half truck or a full truck, request a quote below and our team will call you with prices and delivery details.</p></li>
      </ol>
    </section>

    <section className="section shell bulk-section" id="bulk" aria-labelledby="bulk-h">
      <div className="section-heading"><div><span className="kicker">Bulk buyer prices</span><h2 id="bulk-h">Order in bulk online</h2>
        <p className="shop-description">Choose a quantity: the bulk price applies from the minimum shown. Add to cart and check out as usual.</p></div></div>
      <CatalogueStatus />
      {catalogue && (products.length
        ? <ul className="bulk-list">{products.map(p => <BulkRow key={p.id} product={p} />)}</ul>
        : <div className="empty">Bulk prices are being updated. For bulk orders now, call <a className="underline" href={CONTACT.phoneHref}>{CONTACT.phone}</a> or request a quote below.</div>)}
    </section>

    <section className="section shell quote-section" id="quote">
      <div className="quote-intro"><span className="kicker">Wholesale</span><h2>Pallet &amp; truck orders</h2>
        <p>Wholesale prices depend on the products, quantity and delivery distance, so we quote them personally. Tell us what you need and where it’s going.</p>
        <ul className="tick-list"><li>1, 2 or 3 pallets, a half truck or a full truck</li><li>Mixed loads across our range</li><li>Delivery arranged by our team</li></ul>
        <p className="muted">Prefer to talk? Call <a className="underline" href={CONTACT.phoneHref}>{CONTACT.phone}</a> or <a className="underline" href={`${CONTACT.whatsapp}?text=${encodeURIComponent('Hello Atmonsur, I would like a wholesale quote')}`} target="_blank" rel="noreferrer">WhatsApp us</a>.</p>
      </div>
      <QuoteForm />
    </section>
  </>
}
