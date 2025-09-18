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
        // Add proper cache busting with hashes
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
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
