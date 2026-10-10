# Safe stock tests

- `npm test` (or `npm run test:unit`) runs only no-database unit tests.
- `npm run test:watch` watches those unit tests without creating a database.
- `npm run test:db` runs the existing stock lifecycle/audit regression suites serially in a disposable,
  schema-only database. No business records are copied. It requires development
  database access with CREATE/DROP DATABASE permission, `pg_dump`, and `psql`.
- `npm run test:db -- tests/stock-safety-atomic.spec.js` runs one database suite
  using the same isolation and automatic cleanup.
- `npm run test:db:all` also includes older database suites (campaign reporting,
  imports, refunds, recomputes, and price lists) under the same protection.
  Currently `tests/concurrent-recompute.spec.js` exposes an existing duplicate
  balance-row race in six location-wide concurrent recompute cases. The all-suite
  command reports these failures rather than skipping them or changing production
  behavior to make the tests pass.

Direct `npx vitest run tests/stock-safety-atomic.spec.js` is deliberately rejected
before the spec is imported. Setting a test flag alone is insufficient: the
exact generated database name, URL identity, and server-reported identity must
agree. Production deployments cannot run database tests.

Register new database suites in `tests/helpers/database-suites.js`. Unregistered
tests still cannot connect to the business database: all Vitest projects guard
PostgreSQL connections, and `api/db.js` independently guards test processes,
including when invoked outside this Vitest configuration. Do not disable these
guards or manually set isolation flags to point at an existing database.
