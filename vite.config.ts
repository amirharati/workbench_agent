import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
