import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { DeliveryOptions, ProductCard, ProductImage } from '../components/Product'
import { CONTACT, formatKobo } from '../lib/api'
import { Link, navigate, useLocation } from '../lib/router'
import { useStore } from '../lib/store'
import { lineTotal, unitPrice } from '../../server/src/pricing.ts'
import { productIdFromPath, productPath } from '../../server/src/slug.ts'
import { CatalogueStatus } from './Home'

export function ProductPage() {
  const { path } = useLocation()
  const { catalogue, buyer, addQty, setCartOpen } = useStore()
  const id = productIdFromPath(path)
  const product = catalogue?.products.find(p => p.id === id)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    if (product && path !== productPath(product)) navigate(productPath(product), { replace: true }) // fix old or renamed links
  }, [path, product])
  useEffect(() => {
    if (!product) return
    document.title = `${product.name} (${product.pack}) | Atmonsur Store`
    setQty(buyer === 'bulk' ? product.bulk_min_qty : 1)
    setAdded(false)
  }, [product?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!catalogue) return <section className="section shell"><CatalogueStatus /></section>
  if (!product) {
    document.title = 'Product not available | Atmonsur Store'
    return <section className="section shell checkout-empty"><h1>This product isn’t available</h1>
      <p>It may have sold out or been removed from our range.</p><Link to="/shop" className="button primary">Browse the shop <Icon name="arrow" /></Link></section>
  }

  const p = product
  const unit = unitPrice(p, qty)
  const savingPct = Math.round((1 - p.bulk_price_kobo / p.price_kobo) * 100)
  const related = catalogue.products.filter(o => o.id !== p.id && o.category === p.category)
    .concat(catalogue.products.filter(o => o.id !== p.id && o.category !== p.category)).slice(0, 3)
  const change = (n: number) => { setQty(Math.max(1, Math.min(9999, Math.floor(n) || 1))); setAdded(false) }

  return <>
    <section className="section shell product-detail">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/shop">Shop</Link><span aria-hidden="true">/</span>
        <Link to={`/shop?category=${encodeURIComponent(p.category)}`}>{p.category}</Link><span aria-hidden="true">/</span>
        <span aria-current="page">{p.name}</span>
      </nav>
      <div className="product-detail-grid">
        <div className="product-detail-image">{p.badge && <span className="badge">{p.badge}</span>}<ProductImage product={p} /></div>
        <div>
          <span className="product-category">{p.category}</span>
          <h1>{p.name}</h1>
          <p className="pack">{p.pack}</p>

          <div className="price-tiers">
            <div className={qty < p.bulk_min_qty ? 'tier active' : 'tier'}><small>Retail</small><b>{formatKobo(p.price_kobo)}</b><span>per pack</span></div>
            <div className={qty >= p.bulk_min_qty ? 'tier active' : 'tier'}><small>Wholesale{savingPct > 0 ? ` · save ${savingPct}%` : ''}</small><b>{formatKobo(p.bulk_price_kobo)}</b><span>each from {p.bulk_min_qty} packs</span></div>
          </div>

          <div className="buy-row">
            <div className="qty qty-lg">
              <button onClick={() => change(qty - 1)} aria-label="One less"><Icon name="minus" size={16} /></button>
              <input aria-label="Quantity" inputMode="numeric" value={qty} onChange={e => change(parseInt(e.target.value, 10))} />
              <button onClick={() => change(qty + 1)} aria-label="One more"><Icon name="plus" size={16} /></button>
            </div>
            <button className="button orange" onClick={() => { addQty(p, qty); setAdded(true) }}>Add {qty} to cart · {formatKobo(lineTotal(p, qty))}</button>
          </div>
          <p className="muted" aria-live="polite">
            {qty >= p.bulk_min_qty ? `Wholesale price applied: ${formatKobo(unit)} each.` : `Add ${p.bulk_min_qty - qty} more to pay ${formatKobo(p.bulk_price_kobo)} each.`}
          </p>
          <div role="status" aria-live="polite">{added && <p className="form-success">Added to your cart. <button className="underline font-bold" onClick={() => setCartOpen(true)}>View cart</button></p>}</div>

          {p.description && <div className="product-description">{p.description.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}</div>}
          <dl className="product-facts">
            <div><dt>Pack size</dt><dd>{p.pack}</dd></div>
            <div><dt>Wholesale from</dt><dd>{p.bulk_min_qty} packs</dd></div>
          </dl>
          <h2 className="detail-h">Delivery options</h2>
          <DeliveryOptions />
          <p className="muted">{catalogue.payments === 'palmpay' ? 'Pay securely online with PalmPay at checkout.' : 'Pay by cash or bank transfer on delivery or when you collect.'}</p>
          <p className="muted">Questions about this product? <a className="underline" href={`${CONTACT.whatsapp}?text=${encodeURIComponent(`Hello Atmonsur, I have a question about ${p.name} (${p.pack})`)}`} target="_blank" rel="noreferrer">Ask us on WhatsApp</a> or call {CONTACT.phone}.</p>
        </div>
      </div>
    </section>
    {related.length > 0 && <section className="section shell home-products" aria-labelledby="related-h">
      <div className="section-heading"><div><span className="kicker">You may also need</span><h2 id="related-h">Related products</h2></div></div>
      <div className="products-grid">{related.map(r => <ProductCard key={r.id} product={r} />)}</div>
    </section>}
  </>
}
