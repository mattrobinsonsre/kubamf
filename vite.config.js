import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  const isStaticHosting = process.env.VITE_STATIC_HOSTING === 'true'

  return {
    plugins: [react()],
    base: './',
    build: {
      outDir: 'dist/frontend',
      emptyOutDir: true,
    },
    define: {
      // Inject build-time environment variables
      __STATIC_HOSTING__: JSON.stringify(isStaticHosting),
    },
    server: {
      port: 5173,
      proxy: isStaticHosting ? {} : {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          ws: true, // Enable WebSocket proxy for /api paths
        },
        '/ws': {
          target: 'ws://localhost:3001',
          ws: true,
        }
      }
    }
  }
})