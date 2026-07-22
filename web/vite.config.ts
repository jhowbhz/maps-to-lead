import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A SPA é servida sob /manager (mesmo path do Express em produção). Em dev, o
// Vite roda em :5173/manager/ e faz proxy das rotas de API/SSE pro Express.
const API = 'http://127.0.0.1:9000';

export default defineConfig({
  base: '/manager/',
  plugins: [react()],
  build: {
    // Build gerado direto em public/manager/, que o Express serve.
    outDir: '../public/manager',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/manager/api': { target: API, changeOrigin: true },
      '/manager/stream': { target: API, changeOrigin: true },
    },
  },
});
