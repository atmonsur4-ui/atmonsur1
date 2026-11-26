import { Icon } from '../components/Icon'
import { Link } from '../lib/router'

export function NotFound() {
  return <section className="contact-hero"><div className="shell">
    <span className="kicker light">Page not found</span><h1>We couldn’t find that page.</h1><p>It may have moved. Try the shop or get in touch.</p>
    <div className="hero-ctas"><Link to="/shop" className="button orange">Go to the shop <Icon name="arrow" /></Link><Link to="/contact" className="button secondary">Contact us</Link></div>
  </div></section>
}
