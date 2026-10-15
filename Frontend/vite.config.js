import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
    // PWA plugin removed to prevent icon errors
  ],
  server: {
    host: '0.0.0.0', // Allow access from network (mobile devices)
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || process.env.BACKEND_URL || 'https://cg-test-app.onrender.com',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    // Optimize bundle size
    rollupOptions: {
      output: {
        // Add proper cache busting with hashes
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks: {
          // Separate vendor chunks for better caching
          vendor: ['react', 'react-dom', 'react-router-dom'],
          icons: ['@heroicons/react', 'react-icons', 'lucide-react'],
          utils: ['socket.io-client']
        }
      }
    },
    // One stylesheet for the whole app, Monaco's included (~22 kB gzipped).
    // Split per chunk, the editor's CSS arrives through a preload that a retry
    // after a failed download skips, leaving a working but unstyled editor.
    cssCodeSplit: false,
    // Enable compression
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug']
      }
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
    // Enable gzip compression
    reportCompressedSize: true,
    // Optimize for faster loading
    target: 'es2015'
  },
  // Enable source maps for debugging in production
  sourcemap: false,
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom']
  }
})
