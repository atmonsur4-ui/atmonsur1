import { Icon } from '../components/Icon'
import { ProductArt } from '../components/ProductArt'
import { BuyerStrip, ProductCard } from '../components/Product'
import { CONTACT } from '../lib/api'
import { Link, navigate, useLocation } from '../lib/router'
import { useStore } from '../lib/store'
import { CatalogueStatus } from './Home'

export function Shop() {
  const { query } = useLocation()
  const { catalogue } = useStore()
  const q = query.get('q')?.trim() ?? ''
  const category = query.get('category') ?? 'All'
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const visible = (catalogue?.products ?? []).filter(p =>
    (category === 'All' || p.category === category) &&
    terms.every(t => `${p.name} ${p.category} ${p.pack}`.toLowerCase().includes(t)))

  // Filters live in the URL so results can be shared and survive a refresh.
  const setFilter = (next: { category?: string; q?: string }) => {
    const params = new URLSearchParams()
    const c = next.category ?? category, s = next.q ?? q
    if (c !== 'All') params.set('category', c)
    if (s) params.set('q', s)
    navigate(`/shop${params.size ? `?${params}` : ''}`, { replace: true })
  }

  return <>
    <section className="page-hero"><div className="shell">
      <div><span className="kicker">The Atmonsur store</span><h1>Everyday essentials.<br /><em>Better value.</em></h1><p>Shop food, drinks and home-care products for your household or business.</p></div>
      <div className="shop-hero-art"><ProductArt kind="bottle" color="#3796df" /><ProductArt kind="bag" color="#d87a2b" /><ProductArt kind="cleaner" color="#19956f" /></div>
    </div></section>
    <BuyerStrip />
    <section className="section shell shop-page" aria-labelledby="shop-h">
      <div className="section-heading shop-heading">
        <div><span className="kicker">Retail and wholesale</span><h2 id="shop-h">{category === 'All' ? 'All products' : category}</h2>
          <p className="shop-description" aria-live="polite">{q ? <>{visible.length} result{visible.length === 1 ? '' : 's'} for “{q}” <button className="text-link inline-flex" onClick={() => setFilter({ q: '' })}>Clear search</button></> : 'Clear pack sizes and prices, with wholesale rates built in.'}</p></div>
        <div className="filter-pills" role="group" aria-label="Filter by category">
          {['All', ...(catalogue?.categories.map(c => c.name) ?? [])].map(name =>
            <button key={name} aria-pressed={category === name} className={category === name ? 'active' : ''} onClick={() => setFilter({ category: name })}>{name}</button>)}
        </div>
      </div>
      <CatalogueStatus />
      {catalogue && (visible.length
        ? <div className="products-grid">{visible.map(p => <ProductCard key={p.id} product={p} />)}</div>
        : catalogue.products.length === 0
          ? <div className="empty">Our online price list is being updated. To order now, <a className="underline" href={CONTACT.phoneHref}>call {CONTACT.phone}</a> or <Link className="underline" to="/contact">send us a message</Link>.</div>
          : <div className="empty">No matching products found. Try another search or category, or <Link className="underline" to="/contact">ask us</Link>.</div>)}
    </section>
    <section className="shop-help"><div className="shell">
      <div><span className="kicker light">Personal service</span><h2>Not sure what to order?</h2><p>Talk to our team about stock, pack sizes or bulk delivery arrangements.</p></div>
      <a className="button orange" href={`${CONTACT.whatsapp}?text=${encodeURIComponent('Hello Atmonsur, I need help with an order')}`} target="_blank" rel="noreferrer">Chat on WhatsApp <Icon name="arrow" /></a>
    </div></section>
  </>
}
