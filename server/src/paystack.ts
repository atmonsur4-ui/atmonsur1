// Paystack signs every webhook with HMAC-SHA512 of the raw body using your secret key.
export async function paystackSignatureValid(rawBody: string, signature: string | null, secretKey: string): Promise<boolean> {
  if (!signature || !secretKey) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secretKey), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(rawBody)))
  const expected = Array.from(mac, b => b.toString(16).padStart(2, '0')).join('')
  const given = signature.trim().toLowerCase()
  if (given.length !== expected.length) return false
  let diff = 0 // constant-time compare
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  return diff === 0
}

/** Unguessable order reference; it doubles as the key for viewing the order confirmation page. */
export function newReference(now = Date.now()): string {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('')
  return `ATM-${now.toString(36).toUpperCase()}-${rand}`
}
