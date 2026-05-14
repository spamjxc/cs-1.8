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
    target: 'es2019',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.indexOf('node_modules/phaser') >= 0) {
            return 'phaser';
          }
          if (id.indexOf('node_modules/colyseus') >= 0 || id.indexOf('node_modules/@colyseus') >= 0) {
            return 'network';
          }
          return undefined;
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
});
