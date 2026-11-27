import heroImage from '../assets/hero-fmcg.webp'
import { Icon } from '../components/Icon'
import { ProductArt } from '../components/ProductArt'
import { BuyerStrip, ProductCard } from '../components/Product'
import { formatKobo } from '../lib/api'
import { Link, navigate } from '../lib/router'
import { useStore } from '../lib/store'

export function CatalogueStatus() {
  const { catalogue, catalogueError, retry } = useStore()
  if (catalogue) return null
  return <div className="empty" role="status">
    {catalogueError ? <>{catalogueError} <button className="text-link inline-flex" onClick={retry}>Try again</button></> : 'Loading products…'}
  </div>
}

export function Home() {
  const { catalogue, setBuyer } = useStore()
  const products = catalogue?.products ?? []
  // Savings example built from the live price list: each product bought at its wholesale minimum.
  const retail = products.reduce((s, p) => s + p.price_kobo * p.bulk_min_qty, 0)
  const bulk = products.reduce((s, p) => s + p.bulk_price_kobo * p.bulk_min_qty, 0)
  const maxPct = products.length ? Math.floor(Math.max(...products.map(p => (1 - p.bulk_price_kobo / p.price_kobo) * 100))) : 0
  const shopBulk = () => { setBuyer('bulk'); navigate('/shop') }
  const online = catalogue?.payments === 'palmpay'

  return <>
    <section className="shell hero">
      <div className="hero-copy">
        <div className="eyebrow"><span></span>Everyday essentials, ready to order</div>
        <h1>Stock up smarter.<br /><em>Grow your business.</em></h1>
        <p>Shop trusted beverages, food and household essentials at clear prices, with dependable delivery across Nigeria.</p>
        <div className="hero-ctas"><Link to="/shop" className="button primary">Shop products <Icon name="arrow" /></Link><button className="button secondary" onClick={shopBulk}>Buy in bulk</button></div>
        <div className="hero-proof"><span><Icon name="shield" size={17} /> {online ? 'Secure payment with PalmPay' : 'Pay on delivery or pickup'}</span><span><Icon name="truck" size={17} /> Delivery or free store pickup</span></div>
      </div>
      <div className="hero-visual">
        <img src={heroImage} width="1536" height="1024" fetchPriority="high" alt="An assortment of essentials including drinks, grains, noodles and cleaning products" />
        <div className="offer-float"><b>Save more</b><span>on bulk orders</span></div>
        <div className="stock-float"><span className="pulse"></span><span><b>Fresh stock</b><small>Ready to dispatch</small></span></div>
      </div>
    </section>
    <BuyerStrip />

    <section className="section shell" id="categories" aria-labelledby="cat-h">
      <div className="section-heading"><div><span className="kicker">Find what you need</span><h2 id="cat-h">Shop by category</h2></div><Link className="text-link" to="/shop">View all products <Icon name="arrow" size={17} /></Link></div>
      <CatalogueStatus />
      <div className="category-grid">{catalogue?.categories.map(c => <Link key={c.name} to={`/shop?category=${encodeURIComponent(c.name)}`} className="category-card" style={{ background: c.color }}>
        <ProductArt kind={c.art_kind} color={c.art_kind === 'cleaner' ? '#269b74' : c.art_kind === 'bottle' ? '#398ed0' : '#ef8b20'} />
        <span><b>{c.name}</b><small>{c.note}</small></span><i aria-hidden="true"><Icon name="chevron" size={16} /></i>
      </Link>)}</div>
    </section>

    <section className="section shell home-products" aria-labelledby="best-h">
      <div className="section-heading"><div><span className="kicker">Popular right now</span><h2 id="best-h">Best sellers</h2></div><Link className="text-link" to="/shop">Explore the store <Icon name="arrow" size={17} /></Link></div>
      <div className="products-grid">{products.slice(0, 3).map(p => <ProductCard key={p.id} product={p} />)}</div>
    </section>

    <section className="shell wholesale" id="offers" aria-labelledby="offers-h">
      <div className="wholesale-copy"><span className="kicker light">Built for your business</span><h2 id="offers-h">Buying for a shop,<br />hotel or office?</h2>
        <p>Wholesale prices apply automatically once you buy a product's minimum quantity. No account or application needed.</p>
        <ul><li><span>01</span>Wholesale prices that reward volume</li><li><span>02</span>{online ? 'Pay online with PalmPay or bank transfer' : 'Pay by cash or transfer on delivery or pickup'}</li><li><span>03</span>Delivery or free pickup from our Epe store</li></ul>
        <button className="button orange" onClick={shopBulk}>See wholesale prices <Icon name="arrow" /></button></div>
      {products.length > 0 && <div className="wholesale-card"><span className="mini-label">Your business saves</span>
        <div><b>Up to {maxPct}%</b><span>with wholesale pricing</span></div>
        <div className="saving-line"><span>Retail total</span><s>{formatKobo(retail)}</s></div>
        <div className="saving-line strong"><span>Wholesale total</span><b>{formatKobo(bulk)}</b></div>
        <small>Example: the wholesale minimum of every product in our catalogue.</small></div>}
    </section>

    <section className="section shell why" id="about" aria-labelledby="about-h">
      <div className="why-title"><span className="kicker">Why Atmonsur</span><h2 id="about-h">Supply you can count on</h2><p>Atmonsur Multiglobal Resources Ltd supplies households and businesses from our walk-in store in Epe, Lagos.</p></div>
      <div className="benefits">
        <div><i><Icon name="truck" size={27} /></i><b>Reliable delivery</b><p>Choose delivery at checkout and see the fee before you pay, or pick up free from our store.</p></div>
        <div><i><Icon name="shield" size={27} /></i>{online
          ? <><b>Secure payments</b><p>Pay through PalmPay’s secure checkout, with your PalmPay app or by bank transfer. Your bank and wallet details never pass through our website.</p></>
          : <><b>Pay on delivery</b><p>Place your order online and pay by cash or bank transfer when it’s delivered or when you collect it.</p></>}</div>
        <div><i><Icon name="cart" size={27} /></i><b>Wholesale built in</b><p>Prices drop automatically when you buy in wholesale quantities.</p></div>
      </div>
    </section>
  </>
}
