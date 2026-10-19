import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import {releaseIdentityBuildPlugin} from './scripts/lib/release-package.mjs';

export default defineConfig({
  plugins: [releaseIdentityBuildPlugin(fileURLToPath(new URL('.',import.meta.url))), react()],
  root: './client',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5000,
    host: '0.0.0.0',
    allowedHosts: true,
    watch: {
      // Audit metadata and workflow logs are not browser source. Watching them
      // causes full-page reloads which discard staff forms during verification.
      ignored: [/(?:^|\/)(?:\.local|\.agents|\.cache|generated-artifacts|attached_assets)(?:\/|$)/],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/assets': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
