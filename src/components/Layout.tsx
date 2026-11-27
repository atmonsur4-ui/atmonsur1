import { useEffect, useState, type FormEvent } from 'react'
import brandMark from '../assets/atmonsur-mark.jpg'
import { Icon } from './Icon'
import { CONTACT } from '../lib/api'
import { Link, navigate, useLocation } from '../lib/router'
import { useStore } from '../lib/store'

function Brand({ inverted = false }: { inverted?: boolean }) {
  return <Link to="/" className={`brand${inverted ? ' inverted' : ''}`} aria-label="Atmonsur home">
    <img src={brandMark} alt="" width="43" height="43" /><span><b>ATMONSUR</b><small>Multiglobal Resources Ltd</small></span>
  </Link>
}

export function Header() {
  const { path, query } = useLocation()
  const { count, setCartOpen, account } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState(query.get('q') ?? '')
  useEffect(() => setMenuOpen(false), [path])
  useEffect(() => { if (path === '/shop') setSearch(query.get('q') ?? '') }, [path, query.get('q')]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: FormEvent) => {
    e.preventDefault()
    navigate(search.trim() ? `/shop?q=${encodeURIComponent(search.trim())}` : '/shop')
  }
  const nav = [['/shop', 'Shop'], ['/#categories', 'Categories'], ['/#offers', 'Offers'], ['/#about', 'About us'], ['/contact', 'Contact']]

  return <>
    <div className="topbar"><div className="shell topbar-inner"><span>Trusted FMCG supply across Nigeria</span>
      <span className="topbar-right"><span>Customer care: <a href={CONTACT.careHref}><b>{CONTACT.care}</b></a></span><span>Fast, reliable delivery</span></span></div></div>
    <header className="header">
      <div className="shell header-inner">
        <button className="mobile-icon" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu" aria-expanded={menuOpen} aria-controls="main-nav"><Icon name={menuOpen ? 'close' : 'menu'} size={24} /></button>
        <Brand />
        <nav id="main-nav" aria-label="Main" className={menuOpen ? 'nav open' : 'nav'}>
          {nav.map(([to, label]) => <Link key={to} to={to} aria-current={path === to ? 'page' : undefined} className={path === to ? 'active' : ''}>{label}</Link>)}
        </nav>
        <div className="header-actions">
          <Link to="/account" className="account-btn" aria-current={path.startsWith('/account') ? 'page' : undefined}><Icon name="user" /><span>{account ? account.name.split(' ')[0] : 'Account'}</span></Link>
          <button className="cart-btn" onClick={() => setCartOpen(true)} aria-label={`Cart, ${count} ${count === 1 ? 'pack' : 'packs'}`}>
            <Icon name="cart" /><span>Cart</span>{count > 0 && <b aria-hidden="true">{count}</b>}
          </button>
        </div>
      </div>
      <div className="shell search-row">
        <form role="search" className="search" onSubmit={submit}>
          <Icon name="search" />
          <label htmlFor="site-search" className="sr-only">Search products</label>
          <input id="site-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products and categories" />
          <button type="submit">Search</button>
        </form>
      </div>
    </header>
  </>
}

export function Footer() {
  const { catalogue } = useStore()
  return <footer><div className="shell footer-top">
    <div className="footer-brand"><Brand inverted /><p>Your trusted partner for everyday FMCG products at retail and wholesale prices.</p></div>
    <div><h2 className="footer-h">Shop</h2>{catalogue?.categories.slice(0, 5).map(c => <Link key={c.name} to={`/shop?category=${encodeURIComponent(c.name)}`}>{c.name}</Link>)}</div>
    <div><h2 className="footer-h">Company</h2><Link to="/#about">About us</Link><Link to="/contact">Contact</Link><Link to="/shop">Shop online</Link><Link to="/privacy">Privacy policy</Link><Link to="/terms">Terms & conditions</Link></div>
    <div><h2 className="footer-h">Get in touch</h2>
      <a className="contact-line" href={CONTACT.phoneHref}><Icon name="phone" size={17} /> {CONTACT.phone}</a>
      <a className="contact-line" href={`mailto:${CONTACT.email}`}><Icon name="mail" size={17} /> <span className="break-all">{CONTACT.email}</span></a>
      <Link className="contact-line" to="/contact"><Icon name="location" size={17} /> Iraye Rd, Epe, Lagos</Link></div>
  </div>
  <div className="shell footer-bottom"><span>© {new Date().getFullYear()} Atmonsur Multiglobal Resources Ltd.</span><span>{catalogue?.payments === 'palmpay' ? 'Payments processed securely by PalmPay' : 'Pay on delivery or at pickup'}</span></div></footer>
}
