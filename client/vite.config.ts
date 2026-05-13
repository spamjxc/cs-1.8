import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: './client',
  resolve: {
    alias: {
      '@client': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../shared/src')
    }
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    target: 'es2019'
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
});
