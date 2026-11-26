import { useEffect } from 'react'
import { Footer, Header } from './components/Layout'
import { CartDrawer } from './components/CartDrawer'
import { useLocation } from './lib/router'
import { StoreProvider, useStore } from './lib/store'
import { Home } from './pages/Home'
import { Shop } from './pages/Shop'
import { Contact } from './pages/Contact'
import { Checkout } from './pages/Checkout'
import { Order } from './pages/Order'
import { Legal, legalPages } from './pages/Legal'
import { NotFound } from './pages/NotFound'

const titles: Record<string, string> = { '/shop': 'Shop', '/contact': 'Contact us', '/checkout': 'Checkout', '/order': 'Your order', '/privacy': 'Privacy policy', '/terms': 'Terms & conditions' }

function Page() {
  const { path, hash } = useLocation()
  const { announce } = useStore()

  useEffect(() => {
    document.title = `${titles[path] ? `${titles[path]} | ` : ''}Atmonsur Store`
    if (hash) document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' })
    else window.scrollTo(0, 0)
  }, [path, hash])

  const page = path === '/' ? <Home />
    : path === '/shop' ? <Shop />
    : path === '/contact' ? <Contact />
    : path === '/checkout' ? <Checkout />
    : path === '/order' ? <Order />
    : path in legalPages ? <Legal path={path as keyof typeof legalPages} />
    : <NotFound />

  return <div className="min-h-screen bg-[#fbfcfe] text-[#12223c]">
    <a className="skip-link" href="#main">Skip to content</a>
    <Header />
    <main id="main" tabIndex={-1}>{page}</main>
    <Footer />
    <CartDrawer />
    <p className="sr-only" role="status" aria-live="polite">{announce}</p>
  </div>
}

export default function App() {
  return <StoreProvider><Page /></StoreProvider>
}
