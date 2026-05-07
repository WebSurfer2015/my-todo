import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    // Generates dist/stats.html — `open dist/stats.html` after build to inspect
    // chunk composition. Disabled in CI (set ANALYZE=1 to enable locally).
    process.env.ANALYZE
      ? visualizer({
          filename: 'dist/stats.html',
          gzipSize: true,
          brotliSize: true,
        })
      : null,
  ],
  build: {
    rollupOptions: {
      output: {
        // Vite 8 / Rolldown wants a function form. Split heavy deps into
        // their own chunks so:
        //  - Firebase isn't blocking first paint (only loads after auth)
        //  - lucide-react changes don't bust the main app chunk's cache
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase'
          if (id.includes('node_modules/lucide-react')) return 'icons'
          return null
        },
      },
    },
  },
})
