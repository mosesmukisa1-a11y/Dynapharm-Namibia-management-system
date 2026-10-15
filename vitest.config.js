import { defineConfig, configDefaults } from 'vitest/config';
import {databaseSuites} from './tests/helpers/database-suites.js';

export default defineConfig({
  test: {
    globals: true,
    // DB-backed specs share one database; cost/count safety baselines intentionally
    // inspect all physical rows. File concurrency would observe other fixtures.
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          exclude: [...configDefaults.exclude, ...databaseSuites, 'scripts/**/*.test.mjs'],
          setupFiles: ['./tests/helpers/test-connection-setup.js'],
          fileParallelism: true,
          maxWorkers: 4,
        },
      },
      {
        extends: true,
        test: {
          name: 'database',
          environment: 'node',
          include: databaseSuites,
          setupFiles: [
            './tests/helpers/isolated-database-setup.js',
            './tests/helpers/test-connection-setup.js',
          ],
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['assets/js/stock-portal-handlers.js']
    }
  }
});

