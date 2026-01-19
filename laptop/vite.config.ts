import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// Check if running in Electron (service workers don't work there)
const isElectron = process.env.ELECTRON === 'true' || process.argv.includes('--electron')

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
    // Only enable PWA for web builds, not Electron
    !isElectron && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'ISS Skydning Admin',
        short_name: 'Medlems Admin',
        description: 'Master admin application for ISS Skydning membership management',
        theme_color: '#1e40af',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        // Include sql.js wasm file
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024 // 10MB for sql-wasm.wasm
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  // Use relative paths for Electron file:// protocol
  base: './',
  optimizeDeps: {
    exclude: ['sql.js']
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          // Heavy libraries get their own chunks
          'sql': ['sql.js'],
          'xlsx': ['xlsx'],
          'charts': ['recharts'],
          'vendor': ['react', 'react-dom', '@tanstack/react-router', '@tanstack/react-query']
        }
      }
    }
  }
})
