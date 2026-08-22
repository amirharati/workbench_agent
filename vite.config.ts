import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  // Relative URLs so chrome-extension://…/index.html resolves ./assets/*.js correctly.
  base: './',
  plugins: [react()],
  build: {
    // Chrome extension pages do not share module-preload state across their
    // isolated execution worlds. Vite's preload tags are rejected as
    // cross-world mismatches and then fetched again normally, so omit them.
    modulePreload: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        offscreen: resolve(__dirname, 'offscreen.html'),
      },
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // Only pre-bundle the main app — ignore temp/ sample HTML (sidepanels, etc.)
    entries: ['index.html', 'offscreen.html'],
    // SQLite WASM needs to be excluded from pre-bundling
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  server: {
    fs: {
      deny: ['**/temp/**', '**/test_metamask_example/**', '**/ui_mocks/**'],
    },
    // Headers required for OPFS in SQLite WASM (dev server only)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
