import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const file=new URL('../setup-local-database.sh',import.meta.url);
test('local setup contains no embedded password or connection URI output',async()=>{
  const text=await readFile(file,'utf8');
  assert(!/DB_PASSWORD|DATABASE_URL|postgres(?:ql)?:\/\//.test(text));
  assert(text.includes('DB_HOST="localhost"'));
  assert(text.includes('local_psql -f backend/db_schema.sql'));
  assert(text.includes('local_psql -f backend/db_enhancements.sql'));
});
test('production refusal occurs without any database executable available',()=>{
  for(const flags of [{NODE_ENV:'production'},{REPLIT_DEPLOYMENT:'1'},{REPLIT_DEPLOYMENT:'true'}]){
    const result=spawnSync('/bin/bash',[file.pathname],{
      env:{PATH:'/nonexistent',...flags},encoding:'utf8',
    });
    assert.equal(result.status,1);
    assert.match(result.stderr,/Local database setup refused/);
    assert(!result.stdout.includes('Applying'));
  }
});
