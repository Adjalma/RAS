import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    cors: true,
    proxy: {
      // Proxy transparente para eliminar erro de CORS no navegador
      '/v1': {
        target: 'https://logistica.legendariosrio.com.br',
        changeOrigin: true,
        secure: false,
        headers: process.env.VITE_MESH_AUTH_HEADER
          ? { Authorization: process.env.VITE_MESH_AUTH_HEADER }
          : {},
      },
      '/ws': {
        target: 'wss://logistica.legendariosrio.com.br',
        ws: true,
        changeOrigin: true,
        secure: false,
        headers: process.env.VITE_MESH_AUTH_HEADER
          ? { Authorization: process.env.VITE_MESH_AUTH_HEADER }
          : {},
      },
      // Relay de sincronizacao entre estacoes (WebSocket <-> MQTT)
      '/sync': {
        target: 'ws://localhost:8901',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
