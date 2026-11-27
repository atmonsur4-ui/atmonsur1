import postgres from 'postgres'
import { readFileSync } from 'node:fs'

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL (see .env.example)')

export const sql = postgres(process.env.DATABASE_URL, { max: 5, onnotice: () => {} }) // hide "already exists, skipping" notices from migrate()

// Atmonsur's product range, loaded as HIDDEN drafts: pack sizes and prices aren't known yet, so each starts at a
// ₦1 placeholder and stays off the shop until the owner sets real details in admin and ticks "Show on the website".
const RANGE: [string, string, string, string][] = [
  // [category, product, illustration, colour]
  ['Beverages', 'Fizzle Mineral Water', 'bottle', '#3796df'],
  ['Beverages', 'American Cola', 'bottle', '#7a2e1c'],
  ['Beverages', 'Pepsi', 'bottle', '#1d4fa3'],
  ['Beverages', 'Coca-Cola', 'bottle', '#c8102e'],
  ['Beverages', 'Bigi Products', 'bottle', '#e8590c'],
  ['Dairy & NDC Products', 'Kivo Good Time Creamer', 'carton', '#f2a11a'],
  ['Dairy & NDC Products', 'Kivo Garri Mix', 'bag', '#d8a23b'],
  ['Dairy & NDC Products', 'Leya Non Dairy Milk', 'carton', '#2f7ec7'],
  ['Dairy & NDC Products', 'Checkers Peanut', 'jar', '#f4b41b'],
  ['Dairy & NDC Products', 'Creviva Products', 'carton', '#6b3e26'],
  ['Cleaning', 'Hypo Bleach & Cleaner', 'cleaner', '#19956f'],
  ['Noodles & Grains', 'Chikki Chicken Noodles', 'pack', '#ef5a25'],
  ['Noodles & Grains', 'Long & Short Grain Rice', 'bag', '#c9b38a'],
  ['Noodles & Grains', 'Original Garri Ijebu', 'bag', '#d87a2b'],
]
const CATEGORIES = [
  { name: 'Beverages', note: 'Water, soft drinks & more', color: '#e8f3ff', art_kind: 'bottle', sort: 1 },
  { name: 'Dairy & NDC Products', note: 'Milk, cocoa & spreads', color: '#fff4dc', art_kind: 'carton', sort: 2 },
  { name: 'Noodles & Grains', note: 'Noodles, rice & garri', color: '#f7eadf', art_kind: 'bag', sort: 3 },
  { name: 'Cleaning', note: 'Home care', color: '#e7f7ee', art_kind: 'cleaner', sort: 4 },
]
// The demo products shipped before the real range was known; replaced automatically only while untouched.
const OLD_DEMO_PRICES: Record<string, [number, number]> = { // [retail, wholesale] in kobo, exactly as shipped
  'Fizzle Premium Table Water': [450000, 398000], 'Kivo Goodtime Milk': [1860000, 1695000], 'Original Garri Ijebu': [720000, 645000],
  'Chicky Chicken Noodles': [1380000, 1240000], 'Checkers Crunchy Peanut': [1440000, 1275000], 'Hypo Bleach & Cleaner': [960000, 840000],
}
const OLD_DEMO = Object.keys(OLD_DEMO_PRICES)

// Product photos supplied by the owner, shipped in public/products/. Keyed by product name.
const PHOTOS: Record<string, string> = {
  'Checkers Peanut': '/products/checkers-peanut.jpg',
  'Leya Non Dairy Milk': '/products/leya-milk.jpg',
  'Kivo Garri Mix': '/products/kivo-garri-mix.jpg',
  'Kivo Good Time Creamer': '/products/kivo-goodtime-milk.jpg',
  'Pepsi': '/products/pepsi.jpg',
  'American Cola': '/products/american-cola.jpg',
}

/**
 * Adds the supplied photos to products that don't have one yet, exactly once per database (remembered in
 * app_settings), so a photo the owner later removes or replaces in admin is never put back.
 */
// Product renames for databases created with the earlier names. Each runs once (remembered in app_settings), so a
// later rename by the owner in admin is never undone. Only products from the range's own category are touched.
const RENAMES: [key: string, from: string, to: string, category: string][] = [
  ['rename_leya_v1', 'Leya Milk', 'Leya Non Dairy Milk', 'Dairy & NDC Products'],
  ['rename_kivo_creamer_v1', 'Kivo Goodtime Milk', 'Kivo Good Time Creamer', 'Dairy & NDC Products'],
]

async function applyRenames() {
  for (const [key, from, to, category] of RENAMES) {
    if ((await sql`select 1 from app_settings where key = ${key}`).length) continue
    await sql.begin(async tx => {
      await tx`update products set name = ${to} where name = ${from} and category = ${category}`
      await tx`insert into app_settings (key, value) values (${key}, ${new Date().toISOString()}) on conflict do nothing`
    })
  }
}

async function applyPhotos() {
  const done = await sql`select 1 from app_settings where key = 'photos_v1'`
  if (done.length) return
  await sql.begin(async tx => {
    for (const [name, url] of Object.entries(PHOTOS)) await tx`update products set image_url = ${url} where name = ${name} and image_url is null`
    await tx`insert into app_settings (key, value) values ('photos_v1', ${new Date().toISOString()}) on conflict do nothing`
  })
}

async function seedCatalogue() {
  await sql`insert into categories ${sql(CATEGORIES)} on conflict (name) do update set note = excluded.note, color = excluded.color, art_kind = excluded.art_kind, sort = excluded.sort`
  await sql`insert into products ${sql(RANGE.map(([category, name, art_kind, color], i) => ({
    name, category, pack: 'Set pack size', price_kobo: 100, bulk_price_kobo: 100, bulk_min_qty: 5, art_kind, color, active: false, sort: i + 1,
  })))}`
}

/** Swaps the old demo catalogue for the real range, but only if it's exactly the untouched demo and no order exists. */
async function replaceDemoCatalogue() {
  const products = await sql<{ name: string; price_kobo: number; bulk_price_kobo: number; image_url: string | null; description: string | null }[]>`
    select name, price_kobo, bulk_price_kobo, image_url, description from products`
  const untouchedDemo = products.length === OLD_DEMO.length
    && products.every(p => OLD_DEMO_PRICES[p.name]?.join() === [p.price_kobo, p.bulk_price_kobo].join() && !p.image_url && !p.description)
  if (!untouchedDemo) return
  const [{ orders }] = await sql`select count(*)::int as orders from orders`
  if (orders > 0) return
  await sql.begin(async tx => {
    await tx`delete from products`
    await tx`delete from categories where name in ('Dairy', 'Grains & Noodles', 'Snacks')`
  })
  await seedCatalogue()
  console.log('Replaced the demo products with the Atmonsur range (hidden until priced in admin)')
}

/** Creates tables if missing and adds starter data to an empty database. */
export async function migrate() {
  await sql.unsafe(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
  const [{ count }] = await sql`select count(*)::int as count from categories`
  if (count > 0) { await replaceDemoCatalogue(); await applyRenames(); return applyPhotos() }
  await seedCatalogue()
  await sql`insert into delivery_zones ${sql([
    { id: 'pickup', name: 'Pick up from our Epe store (free)', fee_kobo: 0, needs_address: false, sort: 1 },
    { id: 'epe', name: 'Delivery within Epe', fee_kobo: 150000, needs_address: true, sort: 2 },
    { id: 'lagos', name: 'Delivery elsewhere in Lagos', fee_kobo: 400000, needs_address: true, sort: 3 },
    { id: 'outside-lagos', name: 'Delivery outside Lagos', fee_kobo: 800000, needs_address: true, sort: 4 },
  ])}`
  await applyPhotos()
  console.log('Database was empty: added categories, the product range (hidden until priced) and delivery options')
}

export type OrderRow = {
  id: number; reference: string; status: 'pending' | 'paid' | 'failed'; fulfilment: string; customer_id: number | null
  customer_name: string; email: string; phone: string; delivery_zone: string; delivery_zone_name: string
  address: string | null; city: string | null; notes: string | null
  subtotal_kobo: number; delivery_fee_kobo: number; total_kobo: number
  payment_reference: string | null; payment_method: 'palmpay' | 'transfer'; created_at: Date; paid_at: Date | null
}
export type OrderItemRow = { id: number; order_id: number; product_id: number | null; name: string; pack: string; qty: number; unit_price_kobo: number; line_total_kobo: number }
export type PricedRow = { id: number; name: string; pack: string; price_kobo: number; bulk_price_kobo: number; bulk_min_qty: number }
