import type { Context, MiddlewareHandler } from 'hono'

// shortcut: per-process memory, so limits reset on restart and aren't shared between instances; fine for one server.
const hits = new Map<string, { n: number; reset: number }>()
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (h.reset < now) hits.delete(k) }, 60_000).unref()

/** Counts one attempt for `key`; true once more than `max` attempts happened within `windowMs`. */
export function overLimit(key: string, max: number, windowMs = 60_000) {
  const now = Date.now(), h = hits.get(key)
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return false }
  return ++h.n > max
}

export const clientIp = (c: Context) => c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'local'

export const rateLimit = (perMinute: number): MiddlewareHandler => async (c, next) => {
  if (overLimit(`${c.req.path}|${clientIp(c)}`, perMinute)) return c.json({ error: 'Too many requests. Please wait a minute and try again.' }, 429)
  await next()
}
