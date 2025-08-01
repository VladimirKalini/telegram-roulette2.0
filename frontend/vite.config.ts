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
    // Исключаем использование eval в production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      external: ['vm'],
    },
  },
  server: {
    host: true,
    allowedHosts: ['.ngrok-free.app'],
  },
})