import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // BASE_PATH lets the app run under a URL prefix (e.g. /anchordeep/ on ala-wai).
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  resolve: {
    // Bundle the shared package from its TypeScript source (esbuild handles enums);
    // its compiled dist is CommonJS for the Node services.
    alias: {
      '@anchordeep/shared': fileURLToPath(new URL('../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
