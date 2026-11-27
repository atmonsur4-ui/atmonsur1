import { Icon } from './Icon'
import { ProductArt } from './ProductArt'
import { formatKobo, type Product, type Zone } from '../lib/api'
import { useStore } from '../lib/store'
import { Link } from '../lib/router'
import { productPath } from '../../server/src/slug.ts'

export function ProductImage({ product, className }: { product: Product; className?: string }) {
  return product.image_url
    ? <img src={product.image_url} alt={product.name} className={`product-photo ${className ?? ''}`} loading="lazy" />
    : <ProductArt kind={product.art_kind} color={product.color} />
}

export function FavouriteButton({ product: p, className = '' }: { product: Product; className?: string }) {
  const { favourites, toggleFavourite } = useStore()
  const on = favourites.has(p.id)
  return <button className={`fav-btn ${on ? 'on' : ''} ${className}`} onClick={() => toggleFavourite(p)} aria-pressed={on}
    aria-label={on ? `Remove ${p.name} from favourites` : `Save ${p.name} to favourites`} title={on ? 'Saved to favourites' : 'Save to favourites'}>
    <Icon name="heart" size={18} />
  </button>
}

export function ProductCard({ product: p }: { product: Product }) {
  const { add } = useStore()
  const hasBulk = p.bulk_price_kobo < p.price_kobo
  return <article className="product-card">
    <div className="product-media-wrap">
      {p.badge && <span className="badge">{p.badge}</span>}
      <FavouriteButton product={p} />
      <Link to={productPath(p)} className="product-media" tabIndex={-1} aria-hidden="true"><ProductImage product={p} /></Link>
    </div>
    <div className="product-body">
      <span className="product-category">{p.category}</span>
      <h3><Link to={productPath(p)} className="product-link">{p.name}</Link></h3>
      <p className="product-pack">{p.pack}</p>
      <p className="product-price"><b>{formatKobo(p.price_kobo)}</b><span>per pack</span></p>
      {hasBulk && <p className="product-bulk">Bulk price <b>{formatKobo(p.bulk_price_kobo)}</b> each from {p.bulk_min_qty}</p>}
    </div>
    <button className="add-btn" onClick={() => add(p)} aria-label={`Add ${p.name} to cart`}><Icon name="cart" size={17} /> Add to cart</button>
  </article>
}

/** e.g. "Free pickup in Epe, or delivery from ₦1,500" */
export function deliverySummary(zones: Zone[]) {
  const pickup = zones.some(z => !z.needs_address && z.fee_kobo === 0)
  const fees = zones.filter(z => z.needs_address).map(z => z.fee_kobo)
  const delivery = fees.length ? `delivery from ${formatKobo(Math.min(...fees))}` : ''
  const text = [pickup && 'free pickup in Epe', delivery].filter(Boolean).join(', or ')
  return text ? text[0].toUpperCase() + text.slice(1) : ''
}

export function DeliveryOptions() {
  const { catalogue } = useStore()
  if (!catalogue?.zones.length) return null
  return <ul className="delivery-options">
    {catalogue.zones.map(z => <li key={z.id}><span>{z.name}</span><b>{z.fee_kobo ? formatKobo(z.fee_kobo) : 'Free'}</b></li>)}
  </ul>
}

export function WholesaleStrip() {
  return <section className="buyer-strip" aria-label="Wholesale"><div className="shell buyer-inner">
    <p className="wholesale-strip-text"><b>Buying for a shop, hotel or office?</b> Bulk prices apply automatically from each product’s minimum, and we supply by the pallet or truck.</p>
    <Link to="/wholesale" className="button orange">Bulk &amp; wholesale <Icon name="arrow" /></Link>
  </div></section>
}
