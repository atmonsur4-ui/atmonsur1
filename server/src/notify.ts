export const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`

/**
 * Sends a plain-text email through Resend (resend.com). Returns false if not sent.
 * Without RESEND_API_KEY nothing is sent; outside production the email is printed to the log instead, so
 * verification and reset links can be tested locally.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    if (process.env.NODE_ENV === 'production') console.warn(`Email not sent (set RESEND_API_KEY): ${subject}`)
    else console.log(`[email not configured: printed instead]\nTo: ${to}\nSubject: ${subject}\n${text}\n`)
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.NOTIFY_FROM ?? 'Atmonsur Store <onboarding@resend.dev>', to: to.split(','), subject, text }),
    })
    if (!res.ok) console.error('Email failed', res.status, await res.text())
    return res.ok
  } catch (e) {
    console.error('Email failed', e) // never block an order or enquiry on email
    return false
  }
}

/** Emails the shop owner. Skipped with a warning until OWNER_EMAIL is set. */
export async function notifyOwner(subject: string, text: string) {
  const to = process.env.OWNER_EMAIL
  if (!to) return console.warn(`Owner email not sent (set OWNER_EMAIL and RESEND_API_KEY): ${subject}`)
  await sendEmail(to, subject, text)
}
