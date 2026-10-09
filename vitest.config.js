import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: [],
    globals: true,
    // DB-backed specs share one database; cost/count safety baselines intentionally
    // inspect all physical rows. File concurrency would observe other fixtures.
    fileParallelism: false,
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['assets/js/stock-portal-handlers.js']
    }
  }
});

