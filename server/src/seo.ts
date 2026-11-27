// Page titles, descriptions and preview images written into the HTML on the server, because WhatsApp,
// Facebook and other link previews don't run JavaScript. Also the sitemap and robots.txt for search engines.
import { readFileSync } from 'node:fs'
import { sql } from './db.ts'
import { productPath } from './slug.ts'

export const site = () => (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

let shell = ''
// Built by `npm run build`; on Vercel the file sits next to the function (see vercel.ts).
const indexHtml = () => (shell ||= readFileSync(process.env.INDEX_HTML_PATH ?? './dist/index.html', 'utf8'))

type Meta = { title: string; description: string; image?: string; path: string; jsonLd?: object }

/** The single-page app's HTML, with this page's title and preview tags filled in. */
export function pageHtml(meta?: Meta) {
  const set = (html: string, attr: string, value: string) =>
    html.replace(new RegExp(`(<meta ${attr} content=")[^"]*`), (_, start) => start + esc(value))
  let html = indexHtml()
  html = set(html, 'property="og:image"', meta?.image ?? `${site()}/og-image.jpg`) // previews need a full address
  if (!meta) return html
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(meta.title)}</title>`)
  html = set(html, 'name="description"', meta.description)
  html = set(html, 'property="og:title"', meta.title)
  html = set(html, 'property="og:description"', meta.description)
  const extra = `<link rel="canonical" href="${esc(site() + meta.path)}" /><meta property="og:url" content="${esc(site() + meta.path)}" />`
    + (meta.jsonLd ? `<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c')}</script>` : '')
  return html.replace('</head>', () => `${extra}</head>`)
}

type ProductRow = { id: number; name: string; category: string; pack: string; price_kobo: number; bulk_price_kobo: number; bulk_min_qty: number; image_url: string | null; description: string | null }
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`

/** HTML for /product/<id>-<name>, or null if there's no such product on sale. */
export async function productPage(id: number) {
  const [p] = await sql<ProductRow[]>`select id, name, category, pack, price_kobo, bulk_price_kobo, bulk_min_qty, image_url, description
    from products where id = ${id} and active`
  if (!p) return null
  const path = productPath(p)
  const description = p.description?.replace(/\s+/g, ' ').trim().slice(0, 300) // previews show one line
    || `${p.name}, ${p.pack}. ${naira(p.price_kobo)} per pack, or ${naira(p.bulk_price_kobo)} each from ${p.bulk_min_qty} packs. Order online from Atmonsur in Epe, Lagos.`
  return pageHtml({
    title: `${p.name} (${p.pack}) | Atmonsur Store`, description, path, image: p.image_url ?? undefined,
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: String(p.id), category: p.category, description,
      ...(p.image_url ? { image: p.image_url } : {}),
      offers: { '@type': 'Offer', url: site() + path, priceCurrency: 'NGN', price: (p.price_kobo / 100).toFixed(2), availability: 'https://schema.org/InStock' },
    },
  })
}

export async function sitemap() {
  const products = await sql<{ id: number; name: string }[]>`select id, name from products where active order by sort, id`
  const urls = ['/', '/shop', '/contact', '/privacy', '/terms', ...products.map(productPath)]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${esc(site() + u)}</loc></url>`).join('\n')}\n</urlset>\n`
}

export const robots = () => `User-agent: *\nDisallow: /admin\nDisallow: /checkout\nDisallow: /order\nDisallow: /account\nSitemap: ${site()}/sitemap.xml\n`
