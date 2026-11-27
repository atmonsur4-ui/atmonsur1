// Catalogue (from the server), signed-in account, and cart (saved in the browser so a refresh keeps it).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { navigate } from './router'
import { accountApi, api, type Account, type Catalogue, type Product } from './api'
import { lineTotal, unitPrice } from '../../server/src/pricing.ts'

export type CartLine = { product: Product; qty: number; unit: number; total: number }

type Store = {
  catalogue: Catalogue | null
  catalogueError: string
  retry: () => void
  lines: CartLine[]
  count: number
  subtotal: number
  add: (p: Product) => void
  /** Adds a chosen quantity (product page). */
  addQty: (p: Product, qty: number) => void
  setQty: (id: number, qty: number) => void
  clearCart: () => void
  cartOpen: boolean
  setCartOpen: (open: boolean) => void
  announce: string
  /** The last product added (drives the "Added to cart" popup); `key` changes on every add. */
  added: { product: Product; qty: number; key: number } | null
  dismissAdded: () => void
  account: Account | null
  accountLoaded: boolean
  setAccount: (a: Account | null) => void
  favourites: Set<number>
  /** Signed out: sends the shopper to sign in first. */
  toggleFavourite: (p: Product) => void
  /** Adds quantities from a past order; returns the names of items no longer sold. */
  reorder: (items: { product_id: number | null; name: string; qty: number }[]) => string[]
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
  const [cart, setCart] = usePersisted<Record<number, number>>('atmonsur-cart', {})
  const [cartOpen, setCartOpen] = useState(false)
  const [announce, setAnnounce] = useState('')
  const [added, setAdded] = useState<Store['added']>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [accountLoaded, setAccountLoaded] = useState(false)
  const [favourites, setFavourites] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!account) return setFavourites(new Set())
    accountApi.favourites().then(r => setFavourites(new Set(r.product_ids)), () => {})
  }, [account?.email]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    accountApi.me().then(r => setAccount(r.customer), () => {}).finally(() => setAccountLoaded(true))
  }, [])

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
    const qty = Math.min(9999, (c[p.id] ?? 0) + 1)
    setAnnounce(`${p.name} added to cart. Quantity ${qty}.`)
    setAdded({ product: p, qty, key: Date.now() })
    return { ...c, [p.id]: qty }
  }), [setCart])

  const addQty = useCallback((p: Product, qty: number) => setCart(c => {
    const total = Math.min(9999, (c[p.id] ?? 0) + Math.max(1, Math.floor(qty)))
    setAnnounce(`${p.name} added to cart. Quantity ${total}.`)
    setAdded({ product: p, qty: total, key: Date.now() })
    return { ...c, [p.id]: total }
  }), [setCart])

  const value: Store = {
    catalogue, catalogueError, retry: () => setAttempt(a => a + 1),
    lines,
    count: lines.reduce((s, l) => s + l.qty, 0),
    subtotal: lines.reduce((s, l) => s + l.total, 0),
    add, addQty, setQty, clearCart: () => setCart({}),
    cartOpen, setCartOpen, announce, added, dismissAdded: () => setAdded(null),
    account, accountLoaded, setAccount, favourites,
    toggleFavourite: p => {
      if (!account) return navigate(`/account?next=${encodeURIComponent(window.location.pathname)}`)
      const on = !favourites.has(p.id)
      setFavourites(f => { const n = new Set(f); if (on) n.add(p.id); else n.delete(p.id); return n }) // update now, undo if the server refuses
      setAnnounce(on ? `${p.name} saved to favourites.` : `${p.name} removed from favourites.`)
      accountApi.setFavourite(p.id, on).catch(() => setFavourites(f => { const n = new Set(f); if (on) n.delete(p.id); else n.add(p.id); return n }))
    },
    reorder: items => {
      const sold = new Set(catalogue?.products.map(p => p.id))
      const available = items.filter(i => i.product_id != null && sold.has(i.product_id))
      setCart(c => {
        const next = { ...c }
        for (const i of available) next[i.product_id!] = Math.min(9999, (next[i.product_id!] ?? 0) + i.qty)
        return next
      })
      setAnnounce(`${available.length} item${available.length === 1 ? '' : 's'} added to cart.`)
      return items.filter(i => !available.includes(i)).map(i => i.name)
    },
  }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
