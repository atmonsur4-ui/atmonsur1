// Run with: npm test  (Node 22.18+ runs TypeScript directly)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { lineTotal, unitPrice } from './pricing.ts'
import { parseCheckout, parseEnquiry, REFERENCE } from './validate.ts'
import { newReference, paystackSignatureValid } from './paystack.ts'

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

test('paystack signature check accepts only the exact body and key', async () => {
  const body = '{"event":"charge.success","data":{"reference":"x"}}'
  const sig = createHmac('sha512', 'sk_test_abc').update(body).digest('hex')
  assert.equal(await paystackSignatureValid(body, sig, 'sk_test_abc'), true)
  assert.equal(await paystackSignatureValid(body + ' ', sig, 'sk_test_abc'), false)
  assert.equal(await paystackSignatureValid(body, sig, 'sk_test_other'), false)
  assert.equal(await paystackSignatureValid(body, null, 'sk_test_abc'), false)
})

test('order references match the format the order page accepts', () => {
  assert.match(newReference(), REFERENCE)
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
