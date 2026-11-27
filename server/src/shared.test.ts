// Run with: npm test  (Node 22.18+ runs TypeScript directly)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { lineTotal, unitPrice } from './pricing.ts'
import { parseCheckout, parseEnquiry, REFERENCE } from './validate.ts'
import { md5Upper, newReference, notificationValid, signParams, signString } from './palmpay.ts'
import { generateKeyPairSync } from 'node:crypto'

const water = { price_kobo: 450000, bulk_price_kobo: 398000, bulk_min_qty: 10 }

test('wholesale price starts exactly at the minimum quantity', () => {
  assert.equal(unitPrice(water, 9), 450000)
  assert.equal(unitPrice(water, 10), 398000)
  assert.equal(lineTotal(water, 10), 3980000)
})

const customer = { name: 'Ada Obi', email: 'Ada@Example.com', phone: '+234 801 234 5678', zone: 'epe', address: '1 Road', city: 'Epe' }

test('checkout merges duplicate items and normalises email', () => {
  const r = parseCheckout({ customer, items: [{ product_id: 1, qty: 2 }, { product_id: 1, qty: 3 }, { product_id: 2, qty: 1 }] })
  assert.ok(r.ok)
  assert.deepEqual(r.value.items, [{ product_id: 1, qty: 5 }, { product_id: 2, qty: 1 }])
  assert.equal(r.value.customer.email, 'ada@example.com')
})

test('checkout rejects bad quantities, empty carts and bad contact details', () => {
  for (const qty of [0, -1, 1.5, '2', 10000]) assert.equal(parseCheckout({ customer, items: [{ product_id: 1, qty }] }).ok, qty === '2') // numeric strings are accepted
  assert.equal(parseCheckout({ customer, items: [] }).ok, false)
  assert.equal(parseCheckout({ customer: { ...customer, email: 'nope' }, items: [{ product_id: 1, qty: 1 }] }).ok, false)
  assert.equal(parseCheckout({ customer: { ...customer, phone: 'call me' }, items: [{ product_id: 1, qty: 1 }] }).ok, false)
})

test('enquiry validation and honeypot', () => {
  const good = { name: 'Ada', phone: '08012345678', email: 'a@b.co', subject: 'Delivery', message: 'Do you deliver to Ikorodu?' }
  assert.ok(parseEnquiry(good).ok)
  assert.equal(parseEnquiry({ ...good, subject: 'Hack' }).ok, false)
  assert.equal(parseEnquiry({ ...good, website: 'spam.example' }).spam, true)
})

test('PalmPay signing string matches the worked example in the PalmPay docs', () => {
  // docs.palmpay.com/en/basics-of-access-signature-method
  const params = { requestTime: 1546857549088, version: 'V2.0', nonceStr: 'tXIUBaQUUip97xhymcgvndYo6oSAvQXP', orderId: 'e7c3784d5e2242fc00afe89ac12399', empty: '', none: null }
  const strA = signString(params)
  assert.equal(strA, 'nonceStr=tXIUBaQUUip97xhymcgvndYo6oSAvQXP&orderId=e7c3784d5e2242fc00afe89ac12399&requestTime=1546857549088&version=V2.0')
  assert.equal(md5Upper(strA), 'B43F98EC214118A136077FD49CD70804')
})

test('PalmPay notifications: only a correctly signed, untampered body is accepted', () => {
  // Keys in PalmPay's format: bare base64 DER (PKCS#8 private, X.509 public), like their portal and test page show.
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const priv = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')
  const pub = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
  const fields = { orderId: 'ATMABC123', orderNo: 'PP123', appId: 'L123', currency: 'NGN', amount: 200000, orderStatus: 2, completeTime: 1658574095184 }
  const sign = signParams(fields, priv)
  assert.equal(notificationValid({ ...fields, sign }, pub), true)
  assert.equal(notificationValid({ ...fields, sign: encodeURIComponent(sign) }, pub), true) // PalmPay URL-encodes sign
  assert.equal(notificationValid({ ...fields, amount: 100, sign }, pub), false) // amount changed
  assert.equal(notificationValid({ ...fields, orderStatus: 2 }, pub), false) // no sign
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
  assert.equal(notificationValid({ ...fields, sign }, other), false) // signed by someone else
  assert.equal(notificationValid({ ...fields, sign }, 'not a key'), false)
  // PEM keys work too
  assert.equal(notificationValid({ ...fields, sign: signParams(fields, privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()) }, pub), true)
})

test('order references are what PalmPay accepts (letters/digits, max 32) and what the order page accepts', () => {
  const ref = newReference()
  assert.match(ref, REFERENCE)
  assert.match(ref, /^[A-Za-z0-9]{1,32}$/)
})

test('admin product form converts naira to kobo and enforces wholesale ≤ retail', async () => {
  const { parseProductForm, parseZoneForm } = await import('./validate.ts')
  const base = { name: 'Water', category: 'Beverages', pack: '12 × 75cl', price: '4,500', bulk_price: '3980.50', bulk_min_qty: '10', art_kind: 'bottle', color: '#3796df', active: 'on' }
  const r = parseProductForm(base)
  assert.ok(r.ok)
  assert.equal(r.value.price_kobo, 450000)
  assert.equal(r.value.bulk_price_kobo, 398050)
  assert.equal(r.value.active, true)
  assert.equal(parseProductForm({ ...base, bulk_price: '5000' }).ok, false)
  assert.equal(parseProductForm({ ...base, price: '-1' }).ok, false)
  assert.equal(parseProductForm({ ...base, image_url: 'javascript:alert(1)' }).ok, false)
  assert.equal(parseZoneForm({ id: 'pickup', name: 'Pick up', fee: '0' }).ok, true)
  assert.equal(parseZoneForm({ id: 'Bad Id', name: 'x', fee: '0' }).ok, false)
})

test('passwords: hash verifies only the right password, and each hash is salted', async () => {
  const { hashPassword, verifyPassword } = await import('./passwords.ts')
  const h1 = await hashPassword('correct horse battery'), h2 = await hashPassword('correct horse battery')
  assert.notEqual(h1, h2)
  assert.equal(await verifyPassword('correct horse battery', h1), true)
  assert.equal(await verifyPassword('correct horse batterY', h1), false)
  assert.equal(await verifyPassword('anything', 'garbage'), false)
})

test('signup validation', async () => {
  const { parseSignup } = await import('./validate.ts')
  const good = { name: 'Ada Obi', email: ' ADA@example.com ', phone: '08012345678', password: 'longenough' }
  const r = parseSignup(good)
  assert.ok(r.ok)
  assert.equal(r.value.email, 'ada@example.com')
  assert.equal(parseSignup({ ...good, password: 'short' }).ok, false)
  assert.equal(parseSignup({ ...good, email: 'x' }).ok, false)
})

test('product addresses: readable slug, id is what matters', async () => {
  const { productIdFromPath, productPath, slugify } = await import('./slug.ts')
  assert.equal(slugify('Hypo Bleach & Cleaner (500ml)'), 'hypo-bleach-and-cleaner-500ml')
  assert.equal(productPath({ id: 4, name: 'Chicky Chicken Noodles' }), '/product/4-chicky-chicken-noodles')
  assert.equal(productIdFromPath('/product/4-old-name'), 4)
  assert.equal(productIdFromPath('/product/4'), 4)
  assert.equal(productIdFromPath('/product/abc'), null)
  assert.equal(productIdFromPath('/product/4-x/../admin'), null)
})
