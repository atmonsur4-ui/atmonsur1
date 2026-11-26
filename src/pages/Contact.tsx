import { useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { api, CONTACT } from '../lib/api'

const mapQuery = encodeURIComponent(CONTACT.address)

export function Contact() {
  const [state, setState] = useState<{ status: 'idle' | 'sending' | 'sent' | 'error'; message?: string }>({ status: 'idle' })

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    setState({ status: 'sending' })
    try {
      await api.enquiry(Object.fromEntries(new FormData(form)))
      form.reset()
      setState({ status: 'sent' })
    } catch (e) {
      setState({ status: 'error', message: (e as Error).message })
    }
  }

  return <>
    <section className="contact-hero"><div className="shell"><span className="kicker light">Contact Atmonsur</span><h1>We’re here to help.</h1><p>Questions about a product, a bulk order or delivery? Speak directly with our team.</p></div></section>
    <section className="section shell contact-layout">
      <div className="contact-details"><span className="kicker">Talk to our team</span><h2>Choose the easiest way to reach us</h2>
        <p className="contact-intro">Our team can help with product availability, wholesale pricing, delivery and general enquiries.</p>
        <div className="contact-cards">
          <a href={CONTACT.phoneHref}><i><Icon name="phone" /></i><span><small>Business contact & enquiries</small><b>{CONTACT.phone}</b><em>Call now</em></span></a>
          <a href={CONTACT.careHref}><i><Icon name="phone" /></i><span><small>Customer care line</small><b>{CONTACT.care}</b><em>Call customer care</em></span></a>
          <a href={`mailto:${CONTACT.email}`}><i><Icon name="mail" /></i><span><small>Email us</small><b>{CONTACT.email}</b><em>Send an email</em></span></a>
          <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer"><i><Icon name="location" /></i><span><small>Walk-in store</small><b>{CONTACT.address}</b><em>Get directions</em></span></a>
        </div>
      </div>
      <form className="enquiry-form" onSubmit={submit} aria-labelledby="enq-h">
        <span className="form-label">Send an enquiry</span><h3 id="enq-h">How can we help?</h3>
        <div className="form-grid">
          <label>Full name<input required name="name" autoComplete="name" maxLength={100} placeholder="Your name" /></label>
          <label>Phone number<input required name="phone" type="tel" autoComplete="tel" maxLength={20} placeholder="+234" /></label>
        </div>
        <label>Email address<input required name="email" type="email" autoComplete="email" maxLength={200} placeholder="you@example.com" /></label>
        <label>What is your enquiry about?<select name="subject">{['Product availability', 'Bulk or wholesale order', 'Delivery', 'Existing order', 'General enquiry'].map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Your message<textarea required name="message" rows={5} minLength={5} maxLength={3000} placeholder="Tell us what you need..." /></label>
        <label className="honeypot" aria-hidden="true">Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <button className="button primary" type="submit" disabled={state.status === 'sending'}>{state.status === 'sending' ? 'Sending…' : <>Send enquiry <Icon name="arrow" /></>}</button>
        <div role="status" aria-live="polite">
          {state.status === 'sent' && <p className="form-success">Thank you. Your enquiry has reached our team and we’ll get back to you soon. For anything urgent, please call {CONTACT.phone}.</p>}
          {state.status === 'error' && <p className="form-error">{state.message}</p>}
        </div>
      </form>
    </section>
    <section className="map-section"><div className="shell map-heading">
      <div><span className="kicker">Visit our store</span><h2>Find us in Epe, Lagos</h2><p>{CONTACT.address}.</p></div>
      <a className="button secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`} target="_blank" rel="noreferrer"><Icon name="location" /> Get directions</a></div>
      <div className="map-frame"><iframe title="Map showing the Atmonsur walk-in store near Epe Grammar School" src={`https://maps.google.com/maps?q=${mapQuery}&z=15&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"></iframe></div>
    </section>
    <section className="whatsapp-band"><div className="shell"><div><b>Prefer WhatsApp?</b><span>Chat with our business enquiry team for a quick response.</span></div>
      <a href={`${CONTACT.whatsapp}?text=${encodeURIComponent('Hello Atmonsur, I have an enquiry')}`} target="_blank" rel="noreferrer" className="button orange">Start a conversation <Icon name="arrow" /></a></div></section>
  </>
}
