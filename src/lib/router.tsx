// Minimal client-side router: the URL is the state, so pages can be bookmarked, shared and refreshed.
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'

const listeners = new Set<() => void>()
const notify = () => listeners.forEach(l => l())
window.addEventListener('popstate', notify)

export function navigate(to: string, { replace = false } = {}) {
  window.history[replace ? 'replaceState' : 'pushState']({}, '', to)
  notify()
}

export function useLocation() {
  const href = useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => window.location.href)
  const url = new URL(href)
  return { path: url.pathname.replace(/\/+$/, '') || '/', query: url.searchParams, hash: url.hash.slice(1) }
}

export function Link({ to, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return <a {...props} href={to} onClick={(e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return // let "open in new tab" work
    e.preventDefault()
    navigate(to)
  }} />
}
