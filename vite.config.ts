import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // In development the website runs on Vite and talks to the API server (npm run dev:server) on port 3000.
  server: { proxy: { '/api': 'http://localhost:3000', '/admin': 'http://localhost:3000' } },
})
