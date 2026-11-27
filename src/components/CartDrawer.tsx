import { useEffect, useRef } from 'react'
import { Icon } from './Icon'
import { ProductImage, deliverySummary } from './Product'
import { formatKobo } from '../lib/api'
import { navigate } from '../lib/router'
import { productPath } from '../../server/src/slug.ts'
import { useStore } from '../lib/store'

export function CartDrawer() {
  const { cartOpen, setCartOpen, lines, count, subtotal, setQty, catalogue } = useStore()
  const panel = useRef<HTMLElement>(null)

  // Dialog behaviour: focus moves in, Tab stays inside, Escape closes, focus returns to where it was.
  useEffect(() => {
    if (!cartOpen) return
    const previous = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return setCartOpen(false)
      if (e.key !== 'Tab' || !panel.current) return
      const focusable = [...panel.current.querySelectorAll<HTMLElement>('button, a[href], input')]
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; previous?.focus() }
  }, [cartOpen, setCartOpen])

  if (!cartOpen) return null
  const go = (to: string) => { setCartOpen(false); navigate(to) }

  return <>
    <div className="scrim" onClick={() => setCartOpen(false)} aria-hidden="true" />
    <aside className="cart-drawer" ref={panel} role="dialog" aria-modal="true" aria-labelledby="cart-title">
      <div className="cart-head">
        <div><span id="cart-title">Your cart</span><small>{count} {count === 1 ? 'pack' : 'packs'}</small></div>
        <button onClick={() => setCartOpen(false)} aria-label="Close cart"><Icon name="close" /></button>
      </div>
      <div className="cart-items">
        {lines.length === 0 ? <div className="empty-cart">
          <span><Icon name="cart" size={30} /></span><h3>Your cart is empty</h3><p>Add a few everyday essentials to get started.</p>
          <button className="button primary" onClick={() => go('/shop')}>Continue shopping</button>
        </div> : lines.map(({ product: p, qty, unit, total }) => <div className="cart-item" key={p.id}>
          <div className="cart-thumb"><ProductImage product={p} /></div>
          <div>
            <button className="cart-name" onClick={() => go(productPath(p))}>{p.name}</button><small>{p.pack}</small>
            <span>{formatKobo(unit)} each{unit === p.bulk_price_kobo ? ' · wholesale' : ''}</span>
            {qty < p.bulk_min_qty && <small className="bulk-hint">Add {p.bulk_min_qty - qty} more for {formatKobo(p.bulk_price_kobo)} each</small>}
            <div className="cart-item-row">
              <div className="qty">
                <button onClick={() => setQty(p.id, qty - 1)} aria-label={`Remove one ${p.name}`}><Icon name="minus" size={15} /></button>
                <input aria-label={`Quantity of ${p.name}`} inputMode="numeric" value={qty}
                  onChange={e => { const n = parseInt(e.target.value, 10); if (n > 0) setQty(p.id, n) }} />
                <button onClick={() => setQty(p.id, qty + 1)} aria-label={`Add one ${p.name}`}><Icon name="plus" size={15} /></button>
              </div>
              <b>{formatKobo(total)}</b>
              <button className="remove" onClick={() => setQty(p.id, 0)} aria-label={`Remove ${p.name} from cart`}><Icon name="trash" size={16} /></button>
            </div>
          </div>
        </div>)}
      </div>
      {lines.length > 0 && <div className="cart-summary">
        <div><span>Subtotal</span><b>{formatKobo(subtotal)}</b></div>
        <p>{deliverySummary(catalogue?.zones ?? []) || 'Delivery'}. You choose at checkout.</p>
        <button className="checkout" onClick={() => go('/checkout')}>Proceed to checkout <Icon name="arrow" /></button>
        <span className="secure"><Icon name="shield" size={15} /> {catalogue?.payments === 'palmpay' ? 'Secure payment with PalmPay' : 'Pay on delivery or when you collect'}</span>
      </div>}
    </aside>
  </>
}
