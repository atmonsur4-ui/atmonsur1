// npm run palmpay:check — creates a ₦1 PalmPay order with your .env settings to prove the keys and signing work.
// Nothing is charged: the order simply expires unless someone opens the link and pays it.
import { newReference, palmpay } from './palmpay.ts'

const hints: Record<string, string> = {
  OPEN_GW_000001: 'App ID not recognised: check PALMPAY_APP_ID (it starts with "L").',
  OPEN_GW_000008: 'Signature rejected: PALMPAY_PRIVATE_KEY must match the merchant public key uploaded in the PalmPay merchant portal.',
  OPEN_GW_000010: 'Signature header missing.',
  OPEN_GW_000012: 'This server\'s IP address is not on your PalmPay IP whitelist (required in production).',
  OPEN_GW_000019: 'PalmPay could not read the public key you uploaded: re-upload it in the merchant portal.',
}

const site = process.env.SITE_URL ?? 'http://localhost:3000'
const ref = newReference()
console.log(`PalmPay ${process.env.PALMPAY_ENV === 'production' ? 'PRODUCTION' : 'sandbox'} check, App ID ${process.env.PALMPAY_APP_ID ?? '(not set)'}`)
try {
  const data = await palmpay('/api/v2/payment/merchant/createorder', {
    orderId: ref, amount: 100, currency: 'NGN', title: 'Atmonsur connection test', description: 'Test order, safe to ignore',
    notifyUrl: `${site}/api/palmpay/notify`, callBackUrl: `${site}/order?reference=${ref}`,
  })
  console.log(`✓ Order created. PalmPay order number ${data.orderNo}, status ${data.orderStatus}.`)
  console.log(`  Checkout page: ${data.checkoutUrl}`)
  const status = await palmpay('/api/v2/payment/merchant/order/queryStatus', { orderId: ref })
  console.log(`✓ Status check works: orderStatus ${status.orderStatus} (0 or 1 = waiting for payment, 2 = paid).`)
  console.log('Keys and signing are correct.')
} catch (e) {
  const message = (e as Error).message
  console.error(`✗ ${message}`)
  const code = Object.keys(hints).find(k => message.includes(k))
  if (code) console.error(`  ${hints[code]}`)
  process.exitCode = 1
}
