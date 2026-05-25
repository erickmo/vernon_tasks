import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5174,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://task.localhost:8080',
        changeOrigin: true,
        cookieDomainRewrite: '',
      },
      '/assets': {
        target: 'http://task.localhost:8080',
        changeOrigin: true,
      },
      '/files': {
        target: 'http://task.localhost:8080',
        changeOrigin: true,
      },
      '/private/files': {
        target: 'http://task.localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
