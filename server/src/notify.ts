export const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`

/** Emails the shop owner through Resend (resend.com). Skipped with a warning until RESEND_API_KEY and OWNER_EMAIL are set. */
export async function notifyOwner(subject: string, text: string) {
  const key = process.env.RESEND_API_KEY, to = process.env.OWNER_EMAIL
  if (!key || !to) return console.warn(`Owner email not sent (set RESEND_API_KEY and OWNER_EMAIL): ${subject}`)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.NOTIFY_FROM ?? 'Atmonsur Store <onboarding@resend.dev>', to: to.split(','), subject, text }),
    })
    if (!res.ok) console.error('Owner email failed', res.status, await res.text())
  } catch (e) {
    console.error('Owner email failed', e) // never block an order or enquiry on email
  }
}
