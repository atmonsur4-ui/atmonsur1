import { Icon } from './Icon'
import { ProductArt } from './ProductArt'
import { formatKobo, type Product } from '../lib/api'
import { useStore } from '../lib/store'
import { Link } from '../lib/router'
import { productPath } from '../../server/src/slug.ts'

export function ProductImage({ product, className }: { product: Product; className?: string }) {
  return product.image_url
    ? <img src={product.image_url} alt={product.name} className={`product-photo ${className ?? ''}`} loading="lazy" />
    : <ProductArt kind={product.art_kind} color={product.color} />
}

export function ProductCard({ product: p }: { product: Product }) {
  const { buyer, add } = useStore()
  const bulk = buyer === 'bulk'
  return <article className="product-card">
    <div className="product-image">
      {p.badge && <span className="badge">{p.badge}</span>}
      <Link to={productPath(p)} className="product-image-link" tabIndex={-1} aria-hidden="true"><ProductImage product={p} /></Link>
      <button className="quick-add" onClick={() => add(p)} aria-label={`Add ${p.name} to cart`}><Icon name="plus" /></button>
    </div>
    <div className="product-info">
      <span className="product-category">{p.category}</span>
      <h3><Link to={productPath(p)} className="product-link">{p.name}</Link></h3>
      <p>{p.pack}</p>
      <div className="price-row">
        <div>
          <b>{formatKobo(bulk ? p.bulk_price_kobo : p.price_kobo)}</b>
          <small>{bulk ? `wholesale, from ${p.bulk_min_qty} packs` : `per pack · ${formatKobo(p.bulk_price_kobo)} from ${p.bulk_min_qty}`}</small>
        </div>
        <button onClick={() => add(p)} aria-label={`Add ${p.name} to cart`}>Add to cart</button>
      </div>
    </div>
  </article>
}

export function BuyerStrip() {
  const { buyer, setBuyer } = useStore()
  return <section className="buyer-strip" aria-label="Pricing view"><div className="shell buyer-inner">
    <div><span className="label" id="buyer-label">Show prices for</span>
      <div className="buyer-toggle" role="group" aria-labelledby="buyer-label">
        <button aria-pressed={buyer === 'retail'} className={buyer === 'retail' ? 'active' : ''} onClick={() => setBuyer('retail')}>Retail customer</button>
        <button aria-pressed={buyer === 'bulk'} className={buyer === 'bulk' ? 'active' : ''} onClick={() => setBuyer('bulk')}>Bulk buyer</button>
      </div></div>
    <p>{buyer === 'retail'
      ? 'No minimum order. Wholesale prices apply automatically when you buy enough of a product.'
      : 'Wholesale prices are shown. Adding a product starts at its wholesale minimum quantity.'}</p>
  </div></section>
}
