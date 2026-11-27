// Vercel entry point: one Vercel Function runs the whole server (API, admin, product pages, payment notifications).
// Bundled with index.html and schema.sql next to it by scripts/build-vercel.mjs.
import { fileURLToPath } from 'node:url'
import { getRequestListener } from '@hono/node-server'
import { app } from './index.ts'

process.env.INDEX_HTML_PATH ??= fileURLToPath(new URL('./index.html', import.meta.url))

export default getRequestListener(app.fetch)
