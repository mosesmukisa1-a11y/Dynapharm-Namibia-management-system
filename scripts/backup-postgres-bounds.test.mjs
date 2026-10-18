// Offline: no clients, tools, adapters, credentials or providers.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {POSTGRES_BOUNDS, postgresOptions, assertNativeDumpQueryBounds} from './lib/backup-postgres-bounds.mjs';
import {postgresEnvironment} from './lib/backup-job-io.mjs';
import {runBackup, EXECUTE, ACKNOWLEDGE} from './lib/backup-job.mjs';

const owner = '0123456789abcdef0123456789abcdef';
const env = {NODE_ENV: 'test', B2_BACKUP_SOURCE_CLASS: 'isolated', B2_BACKUP_TEST_OWNER: owner,
  DATABASE_URL: `postgresql://synthetic:SYNTHETIC_PROTECTED@127.0.0.1:65432/b2_backup_test_${owner}?sslmode=disable`,
  B2_BACKUP_OUTPUT_DIR: '/synthetic-private', AWS_ACCESS_KEY_ID: 'SYNTHETIC_PROTECTED',
  AWS_SECRET_ACCESS_KEY: 'SYNTHETIC_PROTECTED', AWS_BACKUP_BUCKET: 'synthetic-never-contact',
  AWS_REGION: 'eu-west-1', B2_BACKUP_KMS_KEY_ARN: 'arn:aws:kms:eu-west-1:000000000000:key/01234567-89ab-4cde-8f01-23456789abcd',
  B2_BACKUP_CIPHERTEXT_ONLY_CONFIRMED: 'true', B2_BACKUP_GOVERNANCE_NO_BYPASS_CONFIRMED: 'true'};

test('fixed dump and preflight options include every reviewed short ceiling', () => {
  assert.equal(Object.isFrozen(POSTGRES_BOUNDS), true);
  for (const preflight of [false, true]) {
    const options = postgresOptions({preflight});
    assert(options.includes(`statement_timeout=${preflight ? 10000 : 120000}`));
    assert(options.includes('lock_timeout=5000'));
    assert(options.includes('idle_in_transaction_session_timeout=30000'));
    assert(options.includes('default_transaction_read_only=on'));
  }
  assert.equal(POSTGRES_BOUNDS.connectMs, 10000);
  assert.equal(POSTGRES_BOUNDS.dumpProcessMs, 120000);
});

test('ambient and source URL options cannot widen backup query limits', () => {
  const source = new URL('postgresql://synthetic:synthetic@synthetic.invalid/fixture?options=-c%20statement_timeout%3D0&connect_timeout=999');
  const result = postgresEnvironment({PGOPTIONS: '-c statement_timeout=0',
    PGCONNECT_TIMEOUT: '999', B2_BACKUP_SOURCE_CLASS: 'production'}, source);
  assert.equal(result.PGOPTIONS, postgresOptions());
  assert.equal(result.PGCONNECT_TIMEOUT, '10');
  assert.equal(result.PGSSLMODE, 'verify-full');
  assert(!result.PGOPTIONS.includes('600000'));
});

test('native dump without proven server-query enforcement is unconditionally fail closed', () => {
  assert.throws(() => assertNativeDumpQueryBounds(), {code: 'DUMP_QUERY_TIMEOUT_UNSUPPORTED'});
  // Extra caller input, including fabricated capabilities, cannot enable execution.
  assert.throws(() => assertNativeDumpQueryBounds({approved: true, timeout: 120000}),
    {code: 'DUMP_QUERY_TIMEOUT_UNSUPPORTED'});
});

test('adapter gates both tool preflight and dump before their first operation', async () => {
  const text = await fs.readFile(new URL('./lib/backup-job-io.mjs', import.meta.url), 'utf8');
  assert.match(text, /async function streamDump\(config, run\) \{\s*assertNativeDumpQueryBounds\(\)/);
  assert.match(text, /async validateTools\(config\) \{[\s\S]*?try \{[\s\S]*?assertNativeDumpQueryBounds\(\);[\s\S]*?await validateLocalConfiguration/);
  assert(text.includes('options: postgresOptions({preflight: true})'));
  assert(!text.includes('statement_timeout=600000'));
});

test('timeout-enforcement refusal is sanitized and stops before source/provider/dump calls', async () => {
  const calls = [], logs = [];
  const result = await runBackup({args: [EXECUTE, ACKNOWLEDGE], env, emit: r => logs.push(r),
    loadIO: async () => ({
      validateTools() { calls.push('tools'); assertNativeDumpQueryBounds(); },
      validateSource() { assert.fail('source contacted'); },
      validateDestination() { assert.fail('provider contacted'); },
      createRun() { assert.fail('staging created'); },
      dump() { assert.fail('dump invoked'); },
    })});
  assert.deepEqual(calls, ['tools']);
  assert.equal(result.code, 'DUMP_QUERY_TIMEOUT_UNSUPPORTED');
  assert.equal(result.status, 'FAILED');
  assert(!JSON.stringify([result, logs]).includes('SYNTHETIC_PROTECTED'));
});

test('dry-run reports timeout limitation without adapter, tool or provider calls', async () => {
  const result = await runBackup({env, loadIO: () => assert.fail('adapter loaded')});
  assert.equal(result.configurationValid, true);
  assert.equal(result.queryTimeoutEnforcement, 'BLOCKED_NATIVE_PG_DUMP_RESETS_SERVER_TIMEOUTS');
  assert.equal(result.databaseCalls, 0);
  assert.equal(result.storageCalls, 0);
  assert.equal(result.providerCalls, 0);
});
