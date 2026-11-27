// Vercel entry point: one Vercel Function runs the whole server (API, admin, product pages, payment notifications).
// Bundled with index.html and schema.sql next to it by scripts/build-vercel.mjs.
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { getRequestListener } from '@hono/node-server'

process.env.INDEX_HTML_PATH ??= fileURLToPath(new URL('./index.html', import.meta.url))

// Load the app (which connects to the database) inside try/catch, so a setup mistake shows a readable page
// instead of Vercel's bare FUNCTION_INVOCATION_FAILED. Full details go to Vercel's function logs.
let handler: (req: IncomingMessage, res: ServerResponse) => unknown
try {
  const { app } = await import('./index.ts')
  handler = getRequestListener(app.fetch)
} catch (e) {
  const err = e as Error & { code?: string }
  console.error('Atmonsur Store failed to start:', err)
  const hint = /DATABASE_URL/.test(err.message) ? 'DATABASE_URL is not set for this environment. Add it in Vercel → Settings → Environment Variables, then redeploy.'
    : /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|password authentication|SSL|does not exist/i.test(`${err.message} ${err.code ?? ''}`)
      ? 'The database could not be reached or rejected the login. Check DATABASE_URL (use Neon\'s pooled connection string).'
      : 'See the function logs in Vercel for details.'
  handler = (_req, res) => {
    res.statusCode = 503
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end(`The store's server could not start.\n${hint}\n`) // no connection details or stack traces in public
  }
}

export default (req: IncomingMessage, res: ServerResponse) => handler(req, res)
