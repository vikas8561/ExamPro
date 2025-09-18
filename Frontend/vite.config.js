import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// import { VitePWA } from 'vite-plugin-pwa' // Temporarily disabled to fix icon error

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // VitePWA temporarily disabled - uncomment when PWA icons are available
    /* VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cg-test-app\.onrender\.com\/api\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              }
            }
          }
        ]
      },
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'ExamPro',
        short_name: 'ExamPro',
        description: 'Advanced Exam Management System',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'vite.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      }
    }) */
  ],
  server: {
    proxy: {
      '/api': {
        target: 'https://cg-test-app.onrender.com',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    // Optimize bundle size
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          vendor: ['react', 'react-dom', 'react-router-dom'],
          monaco: ['@monaco-editor/react'],
          icons: ['@heroicons/react', 'react-icons', 'lucide-react'],
          utils: ['socket.io-client']
        }
      }
    },
    // Enable compression
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000
  },
  // Enable source maps for debugging in production
  sourcemap: false,
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom']
  }
})
