import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';

export default defineConfig({
  root: './client',
  plugins: [
    {
      name: 'copy-game-assets',
      closeBundle() {
        copyDirectory(
          path.resolve(__dirname, 'assets'),
          path.resolve(__dirname, '../dist/client/assets')
        );
      }
    }
  ],
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

function copyDirectory(source: string, target: string): void {
  if (!fs.existsSync(source)) {
    return;
  }

  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source).forEach((entry) => {
    const sourcePath = path.join(source, entry);
    const targetPath = path.join(target, entry);
    const stat = fs.statSync(sourcePath);

    if (stat.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  });
}
