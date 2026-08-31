import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // MapLibre resolves its worker next to the package bundle. Pre-bundling the
    // entry can strand that worker inside Vite's generated deps directory.
    exclude: ['maplibre-gl'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl') || id.includes('node_modules/@mapbox') || id.includes('node_modules/@maplibre')) return 'map-engine'
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'chart-engine'
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react-runtime'
          return undefined
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
