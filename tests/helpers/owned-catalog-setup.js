import {vi} from 'vitest';
// This project already refuses shared/production targets in the first setup
// module. Extend only the data catalog, never mock api/db.js or its executors.
vi.mock('../../api/services/registeredSqlCatalog.js',async importOriginal=>{
  const actual=await importOriginal(),fixtures=await import('./owned-static-sql-catalog.js');
  return {default:{...actual.default,...fixtures.default}};
});
