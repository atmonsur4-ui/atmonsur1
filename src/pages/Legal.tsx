import { CONTACT } from '../lib/api'
import { Link } from '../lib/router'

// Plain-language starting point that matches how this site works. Have it reviewed before relying on it legally.
export const legalPages = {
  '/privacy': {
    title: 'Privacy policy',
    sections: [
      ['Who we are', `Atmonsur Multiglobal Resources Ltd, ${CONTACT.address}. Contact us about your data at ${CONTACT.email} or ${CONTACT.phone}.`],
      ['What we collect', 'When you place an order we collect your name, email address, phone number, delivery address and order details. When you send an enquiry we collect your name, phone number, email address and message. If you create an account we also keep your saved delivery details and your order history. Passwords are stored only in a securely scrambled (hashed) form that we cannot read.'],
      ['Payments', 'Online payments are processed by PalmPay: you pay on PalmPay’s secure checkout page, and your wallet, bank or card details are never sent to or stored by us. Where pay on delivery or pickup is offered, you pay our team directly by cash or bank transfer.'],
      ['How we use it', 'We use your details only to process, deliver and support your order, answer your enquiries, and keep the records the law requires. We do not sell your information or use it for marketing without your permission.'],
      ['Who we share it with', 'PalmPay (payment processing), our email provider (to notify our team of new orders and enquiries), and delivery partners where needed to deliver your order. The map on our contact page is provided by Google Maps.'],
      ['On your device', 'If you log in, we set one cookie that keeps you signed in for up to 30 days; logging out removes it. Your cart and price view are saved in your browser’s local storage so they survive a page refresh. We do not use advertising or tracking cookies.'],
      ['How long we keep it', 'We keep order records for as long as needed for accounting and legal purposes, and enquiries for as long as needed to deal with them.'],
      ['Your rights', `Under Nigeria’s data protection law you can ask to see, correct or delete the personal information we hold about you, including closing your account. You can update your details yourself on your account page, or email ${CONTACT.email} or call ${CONTACT.phone}.`],
    ],
  },
  '/terms': {
    title: 'Terms & conditions',
    sections: [
      ['Prices', 'Prices are shown in naira and include the product only. Wholesale prices apply automatically when you order at least the minimum quantity shown for that product. We may change prices at any time, but the price you pay is the one shown at checkout.'],
      ['Delivery', 'Delivery fees are shown at checkout before you pay. Free pickup is available from our Epe store. After payment we contact you by phone to arrange delivery or pickup.'],
      ['Payment and confirmation', 'When paying online, your order is confirmed once PalmPay reports the payment as successful. When paying on delivery or pickup, we call to confirm your order and you pay the total shown at checkout when you receive or collect it.'],
      ['Availability', 'If an item you paid for turns out to be unavailable, we will contact you to offer a replacement or refund that item.'],
      ['Problems with your order', `If something is missing, damaged or wrong, contact us as soon as possible on ${CONTACT.care} or ${CONTACT.email}. Any agreed refund is paid back through PalmPay to your original payment method.`],
    ],
  },
} satisfies Record<string, { title: string; sections: [string, string][] }>

export function Legal({ path }: { path: keyof typeof legalPages }) {
  const page = legalPages[path]
  return <>
    <section className="contact-hero"><div className="shell"><span className="kicker light">Atmonsur Multiglobal Resources Ltd</span><h1>{page.title}</h1><p>Last updated: 26 November 2026</p></div></section>
    <section className="section shell legal">
      {page.sections.map(([heading, text]) => <div key={heading}><h2>{heading}</h2><p>{text}</p></div>)}
      <p><Link className="text-link" to="/contact">Questions? Contact us</Link></p>
    </section>
  </>
}
