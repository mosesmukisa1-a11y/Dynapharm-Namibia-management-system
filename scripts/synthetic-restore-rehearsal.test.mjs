import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeSyntheticFixture, digest, FIXTURE_CLOCK} from './lib/synthetic-restore-fixture.mjs';
import {rehearse, RUN, ACK} from './lib/synthetic-restore-rehearsal.mjs';
import {assertSchema} from './lib/synthetic-restore-schema.mjs';

const schemas = {};
for (const name of ['b2-backup-manifest.schema.json', 'b2-backup-set.schema.json', 'b2-authorized-object-manifest.schema.json']) {
  schemas[name] = JSON.parse(await readFile(new URL(`../docs/schemas/${name}`, import.meta.url), 'utf8'));
}
const flags = [RUN, ACK];
const run = options => rehearse({schemas, ...options});
function assertZero(r, destination = false) {
  assert.equal(r.providerOperations, 0);
  assert.equal(r.databaseOperations, 0);
  assert.equal(r.storageOperations, 0);
  assert.equal(r.destinationCreated, destination);
  assert.equal(r.rpoProven, false);
  assert.equal(r.rtoProven, false);
  assert.equal(r.b2Closed, false);
}
function editFile(fixture, name, change) {
  const f = fixture.files.find(f => f.name === name);
  f.text = change(f.text);
  f.bytes = Buffer.byteLength(f.text);
  f.sha256 = digest(f.text);
}
// Rehash/relink a tampered fixture, proving an attacker cannot gain admission merely
// by computing consistent hashes over substituted bytes.
function relink(f) {
  const metadata = name => {
    const {text, ...meta} = f.files.find(file => file.name === name);
    return meta;
  };
  const m = JSON.parse(f.files.find(file => file.name === 'manifest.json').text);
  m.artifacts = [metadata('database.dump')];
  f.databaseManifest.artifacts = structuredClone(m.artifacts);
  m.objects = m.objects.map(o => metadata(o.name));
  m.objectManifest = metadata('object-manifest.json');
  m.backupSet.databaseArtifactSha256 = m.artifacts[0].sha256;
  m.backupSet.objectManifestSha256 = m.objectManifest.sha256;
  editFile(f, 'manifest.json', () => JSON.stringify(m, null, 2) + '\n');
  editFile(f, 'SHA256SUMS', () => [...m.artifacts, ...m.objects, m.objectManifest, metadata('manifest.json')]
    .map(o => `${o.sha256}  ${o.name}\n`).join(''));
  editFile(f, 'COMPLETED.json', t => JSON.stringify({...JSON.parse(t),
    manifestSha256: metadata('manifest.json').sha256, checksumsSha256: metadata('SHA256SUMS').sha256,
    objectManifestSha256: m.objectManifest.sha256}) + '\n');
}

test('fixture is deterministic, synthetic and satisfies all three current contracts', () => {
  assert.deepEqual(makeSyntheticFixture(), makeSyntheticFixture());
  const f = makeSyntheticFixture();
  assert.match(f.kind, /SYNTHETIC/);
  const main = JSON.parse(f.files.find(x => x.name === 'manifest.json').text);
  const input = JSON.parse(f.files.find(x => x.name === 'object-manifest.json').text);
  for (const [v, name] of [[f.databaseManifest, 'b2-backup-manifest.schema.json'],
    [main, 'b2-backup-set.schema.json'], [input, 'b2-authorized-object-manifest.schema.json']]) {
    assert.doesNotThrow(() => assertSchema(v, name, schemas));
  }
});
test('default validates without creating a destination or loading adapters', async () => {
  const r = await run();
  assert.equal(r.status, 'PASS');
  assert.equal(r.mode, 'validation-only');
  assert.equal(r.cleanup, 'NOT_REQUIRED_NO_DESTINATION');
  assertZero(r);
});
test('explicit validation also creates nothing', async () => {
  const r = await run({args: ['--validate-only']});
  assert.equal(r.status, 'PASS');
  assertZero(r);
});
for (const args of [
  [RUN], [ACK], ['--execute-owner-approved', '--acknowledge-backup-writes-and-30-day-retention'],
  [...flags, '--execute-owner-approved'], [...flags, '--destination=production'],
  [...flags, '--database-url=postgresql://synthetic-denied'], [...flags, '--validate-only'],
  [...flags, ACK], ['--with-app-storage'],
]) test(`execution flag isolation: ${args.map(a => a.split('=')[0]).join(' ')}`, async () => {
  const r = await run({args});
  assert.equal(r.status, 'FAIL');
  assertZero(r);
});
for (const name of ['destination', 'adapter', 'databaseUrl', 'credentials', 'env', 'cleanupCallback']) {
  test(`caller cannot supply ${name}`, async () => {
    const r = await run({args: flags, [name]: 'SYNTHETIC_SECRET_MUST_NOT_ESCAPE'});
    assert.equal(r.status, 'FAIL');
    assert.equal(r.errorCode, 'OPTION_DENIED');
    assert.ok(!JSON.stringify(r).includes('SYNTHETIC_SECRET'));
    assertZero(r);
  });
}
const invalid = [
  ['production source', f => { f.source = 'postgresql://production.invalid/private'; }, 'SOURCE_DENIED'],
  ['unmarked source', f => { f.kind = 'production'; }, 'SOURCE_DENIED'],
  ['missing cleanup', f => { delete f.cleanupPlan; }, 'CLEANUP_PLAN_REQUIRED'],
  ['unsafe cleanup', f => { f.cleanupPlan = 'delete-remote-retained-data'; }, 'CLEANUP_PLAN_REQUIRED'],
  ['partial object set', f => { f.files.splice(1, 1); }, 'PARTIAL_SET'],
  ['missing completion marker', f => { f.files.pop(); }, 'PARTIAL_SET'],
  ['traversal artifact name', f => { f.files[1].name = '../uploads/private'; }, 'PATH_OR_DUPLICATE'],
  ['duplicate file key', f => { f.files[1] = structuredClone(f.files[0]); }, 'PATH_OR_DUPLICATE'],
  ['checksum mismatch', f => { f.files[0].sha256 = '0'.repeat(64); }, 'ARTIFACT_MISMATCH'],
  ['size mismatch', f => { f.files[1].bytes++; }, 'ARTIFACT_MISMATCH'],
  ['version mismatch', f => { f.files[1].versionId = 'real-provider-version'; }, 'VERSION_MISMATCH'],
  ['null version', f => { f.files[1].versionId = 'null'; }, 'VERSION_MISMATCH'],
  ['malformed complete', f => editFile(f, 'COMPLETED.json', () => '{}'), 'COMPLETION_MISMATCH'],
  ['false main validation', f => editFile(f, 'manifest.json', t => {
    const m = JSON.parse(t); m.validation.fullArchiveDecodePassed = false; return JSON.stringify(m);
  }), 'SCHEMA_VALUE'],
  ['missing original database validation', f => { delete f.databaseManifest.validation; }, 'SCHEMA_VALUE'],
  ['object traversal', f => editFile(f, 'object-manifest.json', t => {
    const m = JSON.parse(t); m.objects[0].key = 'public/uploads/../private'; return JSON.stringify(m);
  }), 'SCHEMA_VALUE'],
  ['duplicate source keys', f => editFile(f, 'object-manifest.json', t => {
    const m = JSON.parse(t); m.objects[1] = structuredClone(m.objects[0]); return JSON.stringify(m);
  }), 'MANIFEST_INVALID'],
  ['wrong private prefix', f => editFile(f, 'object-manifest.json', t => {
    const m = JSON.parse(t); m.objects[1].key = 'public/uploads/synthetic-beta.txt'; return JSON.stringify(m);
  }), 'MANIFEST_INVALID'],
  ['production bucket', f => editFile(f, 'object-manifest.json', t => {
    const m = JSON.parse(t); m.source.bucketId = 'production-denied';
    m.source.bucketIdentitySha256 = digest('replit_app_storage:production-denied'); return JSON.stringify(m);
  }), 'MANIFEST_INVALID'],
  ['extra credentials on envelope', f => { f.credentials = 'SYNTHETIC_SECRET_MUST_NOT_ESCAPE'; }, 'NOT_GENERATED_SYNTHETIC_FIXTURE'],
  ['substituted archive bytes', f => editFile(f, 'database.dump', () => 'not-an-archive'), 'ARTIFACT_MISMATCH'],
  ['modified sums', f => editFile(f, 'SHA256SUMS', t => t.replace('database.dump', 'production.dump')), 'COMPLETION_MISMATCH'],
];
for (const [name, mutate, code] of invalid) test(`pre-I/O rejects ${name}`, async () => {
  const f = makeSyntheticFixture();
  mutate(f);
  const r = await run({fixtureJson: JSON.stringify(f), args: flags});
  assert.equal(r.status, 'FAIL');
  assert.equal(r.errorCode, code);
  assertZero(r);
  assert.ok(!JSON.stringify(r).includes('SYNTHETIC_SECRET'));
});
test('expired authorization at exact threshold rejected before I/O', async () => {
  const r = await run({args: flags, now: new Date('2026-10-18T11:00:00.000Z')});
  assert.equal(r.errorCode, 'MANIFEST_EXPIRED');
  assertZero(r);
});
test('future capture under earlier clock rejected', async () => {
  const r = await run({args: flags, now: new Date('2026-10-18T09:59:59.999Z')});
  assert.equal(r.errorCode, 'MANIFEST_INVALID');
  assertZero(r);
});
test('duplicate JSON properties cannot bypass canonical fixture admission', async () => {
  const text = JSON.stringify(makeSyntheticFixture()).replace('{"kind":', '{"kind":"production","kind":');
  const r = await run({fixtureJson: text, args: flags});
  assert.equal(r.errorCode, 'FIXTURE_INVALID');
  assertZero(r);
});
test('malformed JSON produces no raw error or values', async () => {
  const r = await run({fixtureJson: '{"SYNTHETIC_SECRET":', args: flags});
  assert.equal(r.errorCode, 'VALIDATION_FAILED');
  assert.ok(!JSON.stringify(r).includes('SYNTHETIC_SECRET'));
  assertZero(r);
});
for (const [name, mutate, expected] of [
  ['native-looking archive', f => editFile(f, 'database.dump', () => 'PGDMP-SYNTHETIC-NOT-A-REAL-ARCHIVE'), 'SYNTHETIC_ARCHIVE_INVALID'],
  ['different model rows', f => editFile(f, 'database.dump', t => {
    const db = JSON.parse(t); db.tables[0].rows[0].label = 'synthetic-substituted'; return JSON.stringify(db);
  }), 'SYNTHETIC_ARCHIVE_INVALID'],
  ['completion timestamp', f => editFile(f, 'COMPLETED.json', t => {
    const c = JSON.parse(t); c.completedAtUtc = '2026-10-18T10:01:00.000Z'; return JSON.stringify(c) + '\n';
  }), 'NOT_GENERATED_SYNTHETIC_FIXTURE'],
]) test(`consistent rehash cannot admit ${name}`, async () => {
  const f = makeSyntheticFixture();
  mutate(f);
  relink(f);
  const r = await run({fixtureJson: JSON.stringify(f), args: flags});
  assert.equal(r.errorCode, expected);
  assertZero(r);
});
for (const field of ['manifestSha256', 'checksumsSha256', 'objectManifestSha256', 'backupSetId', 'runId']) {
  test(`completion must bind ${field}`, async () => {
    const f = makeSyntheticFixture();
    editFile(f, 'COMPLETED.json', t => {
      const c = JSON.parse(t); c[field] = 'synthetic-wrong'; return JSON.stringify(c);
    });
    const r = await run({fixtureJson: JSON.stringify(f), args: flags});
    assert.equal(r.errorCode, 'COMPLETION_MISMATCH');
    assertZero(r);
  });
}
test('successful rehearsal verifies order, contents, completion last and cleanup', async () => {
  const r = await run({args: flags});
  assert.equal(r.status, 'PASS');
  assertZero(r, true);
  assert.match(r.destinationId, /^synthetic-disposable-[a-f0-9-]{36}$/);
  assert.deepEqual(r.stages.map(s => s.name), [
    'preflight-all-artifacts-schemas-authorization', 'synthetic-archive-structure-and-content',
    'database-synthetic-restore', 'object-1-restore-and-checksum', 'object-2-restore-and-checksum',
    'object-3-restore-and-checksum', 'restored-set-content-verification',
    'restore-completion-marker-last', 'cleanup-empty-verification']);
  assert.equal(r.cleanupVerified, true);
  assert.equal(r.remainingSyntheticEntries, 0);
  assert.equal(r.syntheticAsOfUtc, FIXTURE_CLOCK);
  assert.ok(r.localElapsedMs >= 0);
  assert.equal(r.timingBasis, 'LOCAL_SYNTHETIC_ONLY_NOT_PRODUCTION_RTO');
});
test('each run owns a fresh non-reusable disposable destination', async () => {
  const a = await run({args: flags}), b = await run({args: flags});
  assert.notEqual(a.destinationId, b.destinationId);
  assert.equal(a.cleanupVerified && b.cleanupVerified, true);
});
for (const failAt of ['database', 'object-2', 'completion', 'cleanup', 'cleanup-verification']) {
  test(`injected ${failAt} failure reports and verifies cleanup`, async () => {
    const r = await run({args: flags, failAt});
    assert.equal(r.status, 'FAIL');
    assertZero(r, true);
    assert.equal(r.cleanupVerified, true);
    assert.equal(r.remainingSyntheticEntries, 0);
    if (failAt.startsWith('cleanup')) {
      assert.equal(r.cleanupPrimary, 'FAIL');
      assert.equal(r.errorCode, 'CLEANUP_VERIFICATION_FAILED');
      assert.ok(r.stages.some(s => s.name === 'cleanup-emergency-memory-teardown' && s.status === 'PASS'));
    } else {
      assert.equal(r.restoreCompletionCreated, false);
      assert.ok(!r.stages.some(s => s.name === 'restore-completion-marker-last'));
    }
  });
}
test('unknown fault cannot introduce arbitrary execution', async () => {
  const r = await run({args: flags, failAt: 'shell-execution'});
  assert.equal(r.errorCode, 'FAULT_DENIED');
  assertZero(r);
});
test('unknown future schema vocabulary fails closed', async () => {
  const altered = structuredClone(schemas);
  altered['b2-backup-set.schema.json'].newUnsupportedConstraint = true;
  const r = await run({args: flags, schemas: altered});
  assert.equal(r.errorCode, 'SCHEMA_CONTRACT');
  assertZero(r);
});
for (const location of ['not', 'unused-definition']) test(`unsupported schema rule in ${location} fails closed`, async () => {
  const altered = structuredClone(schemas);
  const schema = altered['b2-backup-set.schema.json'];
  if (location === 'not') schema.not = {unknownRule: true};
  else schema.$defs.unusedFutureRule = {unknownRule: true};
  const r = await run({args: flags, schemas: altered});
  assert.equal(r.errorCode, 'SCHEMA_CONTRACT');
  assertZero(r);
});
test('implementation cannot import an operational backup/SDK/DB/network adapter', async () => {
  for (const file of ['synthetic-restore-rehearsal', 'synthetic-restore-fixture', 'synthetic-restore-schema']) {
    const text = await readFile(new URL(`./lib/${file}.mjs`, import.meta.url), 'utf8');
    assert.ok(!/\b(?:process\.env|fetch\s*\(|import\s*\(|child_process|pg_dump|pg_restore|awscli)\b/.test(text));
    const imports = [...text.matchAll(/from ['"]([^'"]+)['"]/g)].map(m => m[1]);
    assert.ok(imports.every(x => x.startsWith('node:crypto') || x === 'node:perf_hooks' ||
      x.startsWith('./synthetic-restore-') || x === './backup-object-manifest.mjs'));
  }
});
