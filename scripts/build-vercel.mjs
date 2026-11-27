// `npm run build:vercel`: turns the normal build (dist/) plus the server into Vercel's Build Output format
// (https://vercel.com/docs/build-output-api/v3): static files are served by Vercel's CDN, everything else by one function.
import { build } from 'vite'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'

const out = '.vercel/output'
const fn = `${out}/functions/server.func`
rmSync(out, { recursive: true, force: true })

// 1. Static files. index.html is left out on purpose so "/" reaches the server, which adds the preview tags.
cpSync('dist', `${out}/static`, { recursive: true, filter: src => !/(^|[\\/])dist[\\/]index\.html$/.test(src) })

// 2. The server, bundled into a single file with its dependencies.
await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    ssr: 'server/src/vercel.ts', outDir: fn, emptyOutDir: false, target: 'node22', minify: false, copyPublicDir: false,
    rollupOptions: { output: { entryFileNames: 'index.mjs', format: 'es', codeSplitting: false } },
  },
  ssr: { noExternal: true, target: 'node' },
})
cpSync('dist/index.html', `${fn}/index.html`)
cpSync('server/src/schema.sql', `${fn}/schema.sql`)
writeFileSync(`${fn}/package.json`, JSON.stringify({ type: 'module' }))
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 30 }, null, 2))

// 3. Routing: hashed assets cached for a year, real files served directly, everything else goes to the server.
writeFileSync(`${out}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { src: '^/assets/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
    { handle: 'filesystem' },
    { src: '^/(.*)$', dest: '/server' },
  ],
}, null, 2))
mkdirSync(`${out}`, { recursive: true })
console.log(`Vercel output written to ${out}`)
