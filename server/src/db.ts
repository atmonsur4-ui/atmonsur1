import postgres from 'postgres'
import { readFileSync } from 'node:fs'

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL (see .env.example)')

export const sql = postgres(process.env.DATABASE_URL, { max: 5 })

/** Creates tables if missing and adds starter data to an empty database. */
export async function migrate() {
  await sql.unsafe(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
  const [{ count }] = await sql`select count(*)::int as count from categories`
  if (count > 0) return
  // PLACEHOLDERS: replace products, prices and delivery fees in the admin page before taking payments.
  await sql`insert into categories ${sql([
    { name: 'Beverages', note: 'Water, cola & more', color: '#e8f3ff', art_kind: 'bottle', sort: 1 },
    { name: 'Dairy', note: 'Milk & essentials', color: '#fff4dc', art_kind: 'carton', sort: 2 },
    { name: 'Grains & Noodles', note: 'Pantry staples', color: '#f7eadf', art_kind: 'bag', sort: 3 },
    { name: 'Snacks', note: 'Quick bites', color: '#fff0df', art_kind: 'pack', sort: 4 },
    { name: 'Cleaning', note: 'Home care', color: '#e7f7ee', art_kind: 'cleaner', sort: 5 },
  ])}`
  await sql`insert into products ${sql([
    { name: 'Fizzle Premium Table Water', category: 'Beverages', pack: '75cl × 12 bottles', price_kobo: 450000, bulk_price_kobo: 398000, bulk_min_qty: 10, badge: 'Bestseller', art_kind: 'bottle', color: '#3796df', sort: 1 },
    { name: 'Kivo Goodtime Milk', category: 'Dairy', pack: '400g × 12 sachets', price_kobo: 1860000, bulk_price_kobo: 1695000, bulk_min_qty: 5, badge: 'Save 9%', art_kind: 'carton', color: '#f2a11a', sort: 2 },
    { name: 'Original Garri Ijebu', category: 'Grains & Noodles', pack: '5kg sealed bag', price_kobo: 720000, bulk_price_kobo: 645000, bulk_min_qty: 5, badge: null, art_kind: 'bag', color: '#d87a2b', sort: 3 },
    { name: 'Chicky Chicken Noodles', category: 'Grains & Noodles', pack: '70g × 40 packs', price_kobo: 1380000, bulk_price_kobo: 1240000, bulk_min_qty: 5, badge: 'Popular', art_kind: 'pack', color: '#ef5a25', sort: 4 },
    { name: 'Checkers Crunchy Peanut', category: 'Snacks', pack: '100g × 24 jars', price_kobo: 1440000, bulk_price_kobo: 1275000, bulk_min_qty: 5, badge: 'New', art_kind: 'jar', color: '#f4b41b', sort: 5 },
    { name: 'Hypo Bleach & Cleaner', category: 'Cleaning', pack: '500ml × 12 bottles', price_kobo: 960000, bulk_price_kobo: 840000, bulk_min_qty: 5, badge: null, art_kind: 'cleaner', color: '#19956f', sort: 6 },
  ])}`
  await sql`insert into delivery_zones ${sql([
    { id: 'pickup', name: 'Pick up from our Epe store (free)', fee_kobo: 0, needs_address: false, sort: 1 },
    { id: 'epe', name: 'Delivery within Epe', fee_kobo: 150000, needs_address: true, sort: 2 },
    { id: 'lagos', name: 'Delivery elsewhere in Lagos', fee_kobo: 400000, needs_address: true, sort: 3 },
    { id: 'outside-lagos', name: 'Delivery outside Lagos', fee_kobo: 800000, needs_address: true, sort: 4 },
  ])}`
  console.log('Database was empty: added starter categories, products and delivery zones')
}

export type OrderRow = {
  id: number; reference: string; status: 'pending' | 'paid' | 'failed'; fulfilment: string
  customer_name: string; email: string; phone: string; delivery_zone: string; delivery_zone_name: string
  address: string | null; city: string | null; notes: string | null
  subtotal_kobo: number; delivery_fee_kobo: number; total_kobo: number
  paystack_transaction_id: string | null; created_at: Date; paid_at: Date | null
}
export type OrderItemRow = { id: number; order_id: number; product_id: number | null; name: string; pack: string; qty: number; unit_price_kobo: number; line_total_kobo: number }
export type PricedRow = { id: number; name: string; pack: string; price_kobo: number; bulk_price_kobo: number; bulk_min_qty: number }
