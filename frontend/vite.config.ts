import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills() // <-- Включаем наш новый плагин
  ],
  server: { // <-- ДОБАВЬТЕ ЭТУ СЕКЦИЮ
    host: true, // <-- Это позволит Vite слушать все сетевые интерфейсы
    allowedHosts: [
      '.ngrok-free.app', // <-- Это разрешит все поддомены ngrok-free.app
      // Если ваше приложение работает на каком-то конкретном порту, 
      // убедитесь, что ngrok запускается с этим же портом.
      // Например, если ваше приложение на порту 8888, ngrok http 8888
      // Vite по умолчанию использует 5173.
      // Если ваш локальный сервер Vite работает на другом порту,
      // укажите его здесь:
      // port: 8888, 
    ],
  },
})