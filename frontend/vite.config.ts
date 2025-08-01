import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Исключаем проблемный vm модуль
      exclude: ['vm'],
      // Отключаем eval для production
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    })
  ],
  build: {
    // Отключаем минификацию для экономии RAM
    minify: false,
    // Уменьшаем размер чанков
    rollupOptions: {
      external: ['vm'],
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ton: ['ton', 'ton-core', 'ton-crypto'],
        },
      },
    },
    // Ограничиваем параллельность
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: true,
    allowedHosts: ['.ngrok-free.app'],
  },
})