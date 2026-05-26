import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // Relative URLs so chrome-extension://…/index.html resolves ./assets/*.js correctly.
  base: './',
  plugins: [react()],
  build: {
    // MV3: one JS file per page — avoids "Failed to fetch dynamically imported module"
    // when an old hashed chunk is gone after rebuild but the extension wasn't reloaded.
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  optimizeDeps: {
    // Only pre-bundle the main app — ignore temp/ sample HTML (sidepanels, etc.)
    entries: ['index.html'],
  },
  server: {
    fs: {
      deny: ['**/temp/**', '**/test_metamask_example/**', '**/ui_mocks/**'],
    },
  },
})
