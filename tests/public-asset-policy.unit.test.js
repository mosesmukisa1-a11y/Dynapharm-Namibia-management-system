// @vitest-environment node
import {it,expect} from 'vitest';
import {privateAssetPath} from '../api/services/publicAssetPolicy.js';
it('denies source and maps even if accidentally placed inside the build directory',()=>{
  for(const p of ['/server.js','/scripts/seed-users.js','/migrations/test.sql','/.git/config',
    '/.env','/assets/runtime.js.map','/generated-artifacts/report.md','/node_modules/pg/index.js',
    '/backend/create_tables.sql','/worker/main.mjs','/client/src/App.jsx','/package-lock.json'])
    expect(privateAssetPath(p)).toBe(true);
  for(const p of ['/assets/runtime-abc.js','/assets/style.css','/sw.js','/favicon.ico'])
    expect(privateAssetPath(p)).toBe(false);
});
