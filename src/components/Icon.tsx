import type { ReactNode } from 'react'

export type IconName = 'search' | 'cart' | 'menu' | 'arrow' | 'truck' | 'shield' | 'chevron' | 'minus' | 'plus' | 'close' | 'trash' | 'phone' | 'mail' | 'location'

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    cart: <><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 7H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    truck: <><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.4 2.8 8.1 7 10 4.2-1.9 7-5.6 7-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    minus: <path d="M5 12h14"/>, plus: <path d="M12 5v14M5 12h14"/>, close: <path d="M6 6l12 12M18 6 6 18"/>, trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>,
    phone: <path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-4-2-2 2c-3.4-1.5-6.1-4.2-7.5-7.5l2-2z"/>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
