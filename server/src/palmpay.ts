// PalmPay Checkout (docs.palmpay.com/en/pay-ins-palmpay-checkout-instruction).
// Signing, per docs.palmpay.com/en/basics-of-access-signature-method:
//   1. non-empty fields, sorted by name (ASCII), joined as key=value&key=value
//   2. MD5 of that string, uppercase hex
//   3. SHA1withRSA signature of the MD5 string with the merchant private key, base64 → "Signature" header
// Notifications are checked the same way with PalmPay's public key, over every field except `sign`.
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign as rsaSign, verify as rsaVerify, type KeyObject } from 'node:crypto'

/** Online payment is on once the PalmPay keys are set; until then customers pay by bank transfer before delivery. */
export const palmpayConfigured = () => Boolean(process.env.PALMPAY_APP_ID && process.env.PALMPAY_PRIVATE_KEY)

export const PALMPAY_HOSTS = {
  sandbox: 'https://open-gw-sandbox.palmpay-inc.com',
  production: 'https://open-gw-prod.palmpay-inc.com',
}

/** Status values from PalmPay's data dictionary. Only 2 means the money arrived. */
export const ORDER_STATUS = { unpaid: 0, paying: 1, success: 2, fail: 3, closed: 4 } as const

export function signString(params: Record<string, unknown>) {
  return Object.keys(params)
    .filter(k => params[k] !== null && params[k] !== undefined && String(params[k]).trim() !== '')
    .sort()
    .map(k => `${k}=${typeof params[k] === 'object' ? JSON.stringify(params[k]) : String(params[k]).trim()}`)
    .join('&')
}

export const md5Upper = (s: string) => createHash('md5').update(s, 'utf8').digest('hex').toUpperCase()

/** Accepts PalmPay's bare base64 keys (as shown in their portal and test page) or PEM. */
function loadKey(text: string, kind: 'private' | 'public'): KeyObject {
  const t = text.trim().replace(/\\n/g, '\n') // hosts often store multi-line values with literal \n
  if (t.startsWith('-----')) return kind === 'private' ? createPrivateKey(t) : createPublicKey(t)
  const der = Buffer.from(t.replace(/\s+/g, ''), 'base64')
  return kind === 'private' ? createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }) : createPublicKey({ key: der, format: 'der', type: 'spki' })
}

export function signParams(params: Record<string, unknown>, privateKey: string) {
  return rsaSign('sha1', Buffer.from(md5Upper(signString(params))), loadKey(privateKey, 'private')).toString('base64')
}

/** Checks a payment notification body (all fields except `sign`) against PalmPay's public key. */
export function notificationValid(body: Record<string, unknown>, publicKey: string) {
  const { sign, ...fields } = body
  if (typeof sign !== 'string' || !sign || !publicKey) return false
  let signature = sign
  try { signature = decodeURIComponent(sign) } catch { /* already decoded */ } // docs: URL-decode sign first
  try {
    return rsaVerify('sha1', Buffer.from(md5Upper(signString(fields))), loadKey(publicKey, 'public'), Buffer.from(signature, 'base64'))
  } catch {
    return false // malformed key or signature
  }
}

/** Calls a PalmPay merchant API. Returns `data` on respCode 00000000, throws otherwise. */
export async function palmpay(path: string, fields: Record<string, unknown>) {
  const appId = process.env.PALMPAY_APP_ID, privateKey = process.env.PALMPAY_PRIVATE_KEY
  if (!appId || !privateKey) throw new Error('Set PALMPAY_APP_ID and PALMPAY_PRIVATE_KEY')
  const body = { requestTime: Date.now(), version: 'V1.1', nonceStr: randomBytes(16).toString('hex'), ...fields }
  const host = process.env.PALMPAY_ENV === 'production' ? PALMPAY_HOSTS.production : PALMPAY_HOSTS.sandbox
  const res = await fetch(host + path, {
    method: 'POST',
    headers: {
      Accept: 'application/json', 'Content-Type': 'application/json', CountryCode: 'NG',
      Authorization: `Bearer ${appId}`, Signature: signParams(body, privateKey),
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.respCode !== '00000000') throw new Error(`PalmPay ${path} failed: HTTP ${res.status} ${json.respCode ?? ''} ${json.respMsg ?? ''}`)
  return json.data
}

/**
 * Unguessable order reference; it doubles as the key for viewing the order confirmation page.
 * PalmPay order IDs must be letters and digits only, at most 32 characters: "ATM" + time + 16 hex = 27.
 */
export function newReference(now = Date.now()): string {
  return `ATM${now.toString(36).toUpperCase()}${randomBytes(8).toString('hex')}`
}
