import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // /api/* is a Vercel serverless function with no local equivalent
      // under `vite dev` — proxy to the deployed one so Spotify lookups
      // work in dev instead of erroring on the raw source file.
      '/api': {
        target: 'https://shelf-sage.vercel.app',
        changeOrigin: true,
      },
    },
  },
})
