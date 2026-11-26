// Catalogue (from the server), cart and buyer mode (saved in the browser so a refresh keeps them).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type Catalogue, type Product } from './api'
import { lineTotal, unitPrice } from '../../server/src/pricing.ts'

type Buyer = 'retail' | 'bulk'
export type CartLine = { product: Product; qty: number; unit: number; total: number }

type Store = {
  catalogue: Catalogue | null
  catalogueError: string
  retry: () => void
  buyer: Buyer
  setBuyer: (b: Buyer) => void
  lines: CartLine[]
  count: number
  subtotal: number
  add: (p: Product) => void
  setQty: (id: number, qty: number) => void
  clearCart: () => void
  cartOpen: boolean
  setCartOpen: (open: boolean) => void
  announce: string
}

const StoreContext = createContext<Store | null>(null)
export const useStore = () => useContext(StoreContext)!

function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? '')
      return typeof saved === typeof initial && saved !== null ? saved : initial // ignore corrupted or old-format values
    } catch { return initial }
  })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode: keep in memory only */ } }, [key, value])
  return [value, setValue] as const
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
  const [catalogueError, setCatalogueError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [buyer, setBuyer] = usePersisted<Buyer>('atmonsur-buyer', 'retail')
  const [cart, setCart] = usePersisted<Record<number, number>>('atmonsur-cart', {})
  const [cartOpen, setCartOpen] = useState(false)
  const [announce, setAnnounce] = useState('')

  useEffect(() => {
    setCatalogueError('')
    api.catalogue().then(setCatalogue, e => setCatalogueError(e.message))
  }, [attempt])

  // Products removed from the catalogue simply drop out of the cart.
  const lines = useMemo(() => (catalogue?.products ?? [])
    .filter(p => cart[p.id] > 0)
    .map(p => ({ product: p, qty: cart[p.id], unit: unitPrice(p, cart[p.id]), total: lineTotal(p, cart[p.id]) })), [catalogue, cart])

  const setQty = useCallback((id: number, qty: number) => setCart(c => {
    const next = { ...c }
    if (qty > 0) next[id] = Math.min(9999, Math.floor(qty)); else delete next[id]
    return next
  }), [setCart])

  const add = useCallback((p: Product) => setCart(c => {
    // Bulk buyers start at the wholesale minimum so they get the price they were shown.
    const qty = Math.min(9999, Math.max((c[p.id] ?? 0) + 1, buyer === 'bulk' ? p.bulk_min_qty : 1))
    setAnnounce(`${p.name} added to cart. Quantity ${qty}.`)
    return { ...c, [p.id]: qty }
  }), [buyer, setCart])

  const value: Store = {
    catalogue, catalogueError, retry: () => setAttempt(a => a + 1),
    buyer, setBuyer, lines,
    count: lines.reduce((s, l) => s + l.qty, 0),
    subtotal: lines.reduce((s, l) => s + l.total, 0),
    add, setQty, clearCart: () => setCart({}),
    cartOpen, setCartOpen, announce,
  }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
