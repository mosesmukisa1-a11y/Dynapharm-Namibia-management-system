import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

function loadTailwindPlugin() {
  try {
    const mod = require('@tailwindcss/vite');
    return (mod.default || mod)();
  } catch {
    return null;
  }
}

const tailwindPlugin = loadTailwindPlugin();

export default defineConfig({
  plugins: [react(), tailwindPlugin].filter(Boolean),
  root: './client',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5000,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/assets': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
