import { useEffect } from 'react'
import { Icon } from './Icon'
import { ProductImage } from './Product'
import { formatKobo } from '../lib/api'
import { navigate, useLocation } from '../lib/router'
import { useStore } from '../lib/store'
import { unitPrice } from '../../server/src/pricing.ts'

/** "Added to cart" popup. Screen readers already hear the add via the store's live announcement, so this isn't a live region. */
export function AddedToast() {
  const { added, dismissAdded, setCartOpen, cartOpen, count } = useStore()

  useEffect(() => {
    if (!added) return
    const t = setTimeout(dismissAdded, 5000)
    return () => clearTimeout(t)
  }, [added?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (cartOpen) dismissAdded() }, [cartOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  const { path } = useLocation()
  useEffect(() => dismissAdded(), [path]) // eslint-disable-line react-hooks/exhaustive-deps -- a new page closes the popup

  if (!added) return null
  const { product: p, qty } = added
  const unit = unitPrice(p, qty)
  return <div className="added-toast" key={added.key}>
    <div className="added-toast-thumb"><ProductImage product={p} /></div>
    <div className="added-toast-body">
      <p className="added-toast-title"><Icon name="cart" size={15} /> Added to cart</p>
      <p className="added-toast-name">{p.name}</p>
      <p className="added-toast-meta">{qty} in cart · {formatKobo(unit)} each{unit === p.bulk_price_kobo && p.bulk_price_kobo < p.price_kobo ? ' (bulk price)' : ''}</p>
      {qty < p.bulk_min_qty && p.bulk_price_kobo < p.price_kobo && <p className="added-toast-hint">Add {p.bulk_min_qty - qty} more for the bulk price of {formatKobo(p.bulk_price_kobo)}</p>}
      <div className="added-toast-actions">
        <button className="button secondary" onClick={() => setCartOpen(true)}>View cart ({count})</button>
        <button className="button orange" onClick={() => { dismissAdded(); navigate('/checkout') }}>Checkout</button>
      </div>
    </div>
    <button className="added-toast-close" onClick={dismissAdded} aria-label="Close"><Icon name="close" size={18} /></button>
  </div>
}
