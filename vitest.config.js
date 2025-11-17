import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: [],
    globals: true,
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['assets/js/stock-portal-handlers.js']
    }
  }
});

