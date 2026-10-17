// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {assertCodeOnlyWebProfile, createStartupPolicy, runStartupOperation,
  STARTUP_OPERATIONS} from '../api/services/startupPolicy.js';
import {assertProductionRotationAuthority} from '../api/services/credentialSecurity.js';
const flags={STARTUP_MODE:'code-only',ALLOW_SCHEMA_SYNC:'false',ALLOW_REFERENCE_SEEDS:'false',
  ALLOW_INVENTORY_SEED:'false',ALLOW_STOCK_SUMMARY_DDL:'false',ENABLE_STOCK_SCHEDULER:'false',
  ENABLE_STOCK_HEALTH_DIGEST:'false',WORKER_ENABLED:'false'};
it('fails closed for every missing/invalid strict flag and every worker task override',()=>{
  for(const marker of [{NODE_ENV:'production'},{REPLIT_DEPLOYMENT:'1'},{REPLIT_DEPLOYMENT:'true'}]){
    expect(createStartupPolicy({...flags,...marker}).writesAllowed).toBe(false);
    for(const key of Object.keys(flags)){
      const env={...flags,...marker};delete env[key];
      expect(()=>assertCodeOnlyWebProfile(env)).toThrow();
      expect(()=>assertCodeOnlyWebProfile({...env,[key]:'invalid'})).toThrow();
    }
  }
  expect(()=>assertCodeOnlyWebProfile({...flags,WORKER_DRIFT_DETECTION:'true'})).toThrow();
  expect(()=>assertCodeOnlyWebProfile({...flags,WORKER_NEW_UNKNOWN_JOB:'yes'})).toThrow();
});
it('all startup effects skipped, no account seed/reset SQL remains, launcher used',()=>{
  let called=0;
  for(const op of Object.keys(STARTUP_OPERATIONS))
    runStartupOperation(assertCodeOnlyWebProfile(flags),op,()=>called++,()=>{});
  expect(called).toBe(0);
  const source=readFileSync('server.js','utf8');
  expect(source).not.toMatch(/INSERT INTO users|SET password_hash|const staffUsers/);
  expect(readFileSync('.replit','utf8')).toContain('run = ["node", "scripts/start-code-only-web.mjs"]');
});
it('retired credential tools cannot connect, seed, reset or import in production/deployment',()=>{
  for(const file of ['scripts/seed-users.js','scripts/import-local-users.js','scripts/migrate-user-passwords.js']){
    const r=spawnSync(process.execPath,[file],{encoding:'utf8',env:{PATH:process.env.PATH,
      NODE_ENV:'production',REPLIT_DEPLOYMENT:'1'}});
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('Legacy credential import is disabled');
    expect(r.stdout).toBe('');
  }
});
it('source credential scanner never emits matched values and keeps keyed fingerprints',()=>{
  const source=readFileSync('scripts/audit-credential-exposure.py','utf8');
  expect(source).toContain('hmac.new(KEY');
  expect(source).not.toMatch(/print\((?:raw|match|data|text)\)/);
});
it('production credential operations require explicit authorization and exact account scope',()=>{
  expect(()=>assertProductionRotationAuthority(['SYNTHETIC'],{NODE_ENV:'production'})).toThrow();
  const approved={REPLIT_DEPLOYMENT:'true',PRODUCTION_CREDENTIAL_REMEDIATION_AUTHORIZED:'true',
    CREDENTIAL_ROTATION_AUTHORIZATION_REF:'isolated-authorization',
    CREDENTIAL_ROTATION_ACCOUNT_IDS:'SYNTHETIC'};
  expect(()=>assertProductionRotationAuthority(['SYNTHETIC'],approved)).not.toThrow();
  expect(()=>assertProductionRotationAuthority(['OTHER'],approved)).toThrow();
});
