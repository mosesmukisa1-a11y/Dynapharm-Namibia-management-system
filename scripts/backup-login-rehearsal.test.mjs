// Native tools against a new synthetic Unix-only cluster. NO production endpoints,
// passwords, operational backup/restore adapter, AWS, storage or provider callbacks.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {
  createLocalCluster, localClient, localQuery, closeLocalClient, cleanupLocalCluster,
  syntheticDump, inspectSyntheticArchive, localToolEnvironment,
} from './lib/backup-login-rehearsal.mjs';
import {assertExternalDumpPlatform} from './lib/backup-bounded-dump.mjs';

const evidenceDir = new URL('../generated-artifacts/b2-backup-login-rehearsal/', import.meta.url);
const verifySQL = await fs.readFile(new URL('../docs/b2-backup-login-verification.sql', import.meta.url), 'utf8');
const backupRole = 'dynapharm_backup_ro';

test('synthetic backup login: grants, denial, dump, negative controls and exact rollback', {timeout: 180_000}, async t => {
  const started = Date.now(), checks = [];
  let cluster, admin, cleanup, setup = 'NOT_RUN', rollback = 'NOT_RUN';
  let dumpEvidence;
  async function check(name, fn) {
    await t.test(name, async () => {
      try { await fn(); checks.push({name, status: 'PASS'}); }
      catch (error) {
        const category = /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'ASSERTION_OR_LOCAL_FAILURE';
        checks.push({name, status: 'FAIL', category, ...(error.diagnostic ? {diagnostic: error.diagnostic} : {})});
        // Do not allow raw PostgreSQL/tool/assertion diagnostics into TAP.
        throw new Error(`${name}:${category}${error.diagnostic ? ':' + JSON.stringify(error.diagnostic) : ''}`);
      }
    });
  }
  const q = (client, text, args) => localQuery(cluster, client, text, args);
  async function asBackup(fn) {
    const c = await localClient(cluster, backupRole);
    try { return await fn(c); }
    finally { await closeLocalClient(cluster, c); }
  }
  async function verify(c) {
    const result = await q(c, verifySQL, [cluster.database, ['synthetic']]);
    assert.equal(result.rows.length, 1);
    return result.rows[0];
  }
  async function denies(client, sql, state) {
    let observed = 'NOT_REJECTED';
    try { await q(client, sql); }
    catch (error) { observed = error.code; }
    if (observed !== state) {
      const error = new Error('DENIAL_MISMATCH');
      error.code = 'DENIAL_MISMATCH';
      error.diagnostic = {operation: sql.split(' ')[0], expected: state, observed};
      throw error;
    }
  }
  try {
    cluster = await createLocalCluster();
    const bootstrap = await localClient(cluster, 'rehearsal_admin', 'postgres');
    await q(bootstrap, 'CREATE DATABASE b2_role_rehearsal');
    await closeLocalClient(cluster, bootstrap);
    admin = await localClient(cluster);
    // All changes below affect ONLY this fresh local cluster.
    await q(admin, `
      CREATE ROLE rehearsal_unrelated LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
      CREATE SCHEMA synthetic;
      CREATE TABLE synthetic.items(id serial PRIMARY KEY, label text NOT NULL);
      INSERT INTO synthetic.items(label) VALUES ('SYNTHETIC_A'), ('SYNTHETIC_B');
      CREATE TABLE synthetic.unrelated(id integer PRIMARY KEY);
      GRANT USAGE ON SCHEMA synthetic TO rehearsal_unrelated;
      GRANT CONNECT ON DATABASE b2_role_rehearsal TO rehearsal_unrelated;
      GRANT SELECT,INSERT ON synthetic.unrelated TO rehearsal_unrelated;
      CREATE FUNCTION synthetic.unsafe_public() RETURNS integer LANGUAGE sql AS 'SELECT 1';
      SELECT lo_from_bytea(90001, decode('53594e544845544943', 'hex'));
      CREATE ROLE dynapharm_backup_ro LOGIN PASSWORD NULL NOSUPERUSER NOCREATEDB NOCREATEROLE
        NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 1;
      ALTER ROLE dynapharm_backup_ro SET default_transaction_read_only = 'on';
      ALTER ROLE dynapharm_backup_ro SET statement_timeout = '120s';
      ALTER ROLE dynapharm_backup_ro SET lock_timeout = '5s';
      ALTER ROLE dynapharm_backup_ro SET idle_in_transaction_session_timeout = '30s';
      ALTER ROLE dynapharm_backup_ro SET search_path = 'pg_catalog';
      GRANT CONNECT ON DATABASE b2_role_rehearsal TO dynapharm_backup_ro;
      GRANT USAGE ON SCHEMA synthetic TO dynapharm_backup_ro;
      GRANT SELECT ON ALL TABLES IN SCHEMA synthetic TO dynapharm_backup_ro;
      GRANT SELECT ON ALL SEQUENCES IN SCHEMA synthetic TO dynapharm_backup_ro;
      GRANT SELECT ON LARGE OBJECT 90001 TO dynapharm_backup_ro;
    `);
    // Fixed local fixture validity; not a password or secret.
    const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await q(admin, `ALTER ROLE dynapharm_backup_ro VALID UNTIL '${until}'`);
    setup = 'PASS';

    await check('fresh role defaults, SELECT and no elevated attributes or memberships', () => asBackup(async c => {
      const row = await verify(c);
      for (const key of ['exact_login','private_database_identity_matches','transaction_read_only',
        'role_read_only_default','statement_timeout_bounded','lock_timeout_bounded','idle_timeout_bounded',
        'minimal_role_attributes','no_role_memberships','owns_no_objects','table_select_complete',
        'sequence_select_complete','large_object_select_complete']) assert.equal(row[key], true, key);
      assert.equal((await q(c, 'SELECT count(*)::integer AS n FROM synthetic.items')).rows[0].n, 2);
      assert.equal((await q(c, 'SELECT last_value FROM synthetic.items_id_seq')).rows.length, 1);
      assert.equal((await q(c, 'SELECT octet_length(lo_get(90001)) AS n')).rows[0].n, 9);
    }));

    await check('PUBLIC TEMP, other database, app routine and large-object creation are rejected by verifier', () => asBackup(async c => {
      const row = await verify(c);
      for (const key of ['no_database_ddl_privileges','no_other_database_connect',
        'no_unreviewed_application_routine_execution','no_large_object_creation_routines',
        'no_table_or_column_write_privileges']) {
        assert.equal(row[key], false, key);
      }
      // Defaults are mutable: effective table ACLs alone do not stop PUBLIC
      // built-in lo_create. Demonstrate this gap ONLY with synthetic local data.
      await q(c, 'SET default_transaction_read_only = off');
      await q(c, 'SELECT lo_create(90002)');
    }));
    await q(admin, 'SELECT lo_unlink(oid) FROM pg_largeobject_metadata WHERE oid=90002');
    // Harden the disposable fixture baseline; NEVER a production recommendation.
    // A production scope requiring these PUBLIC changes must instead STOP.
    await q(admin, `
      REVOKE ALL ON DATABASE b2_role_rehearsal FROM PUBLIC;
      REVOKE CONNECT ON DATABASE postgres, template1 FROM PUBLIC;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      REVOKE UPDATE ON pg_catalog.pg_settings FROM PUBLIC;
      REVOKE UPDATE(setting) ON pg_catalog.pg_settings FROM PUBLIC;
      REVOKE EXECUTE ON FUNCTION synthetic.unsafe_public() FROM PUBLIC;
      REVOKE EXECUTE ON FUNCTION pg_catalog.lo_create(oid) FROM PUBLIC;
      REVOKE EXECUTE ON FUNCTION pg_catalog.lo_from_bytea(oid,bytea) FROM PUBLIC;
      REVOKE EXECUTE ON FUNCTION pg_catalog.lo_import(text), pg_catalog.lo_import(text,oid) FROM PUBLIC;
    `);

    await check('full fixed verifier parses; only non-production TLS and recovery gates remain false', () => asBackup(async c => {
      const row = await verify(c);
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'boolean') {
          const expected = !['recovery_replica', 'transport_tls_active'].includes(key);
          if (value !== expected) {
            const error = new Error('VERIFIER_MISMATCH');
            error.code = 'VERIFIER_MISMATCH';
            error.diagnostic = {check: key, expected, observed: value};
            throw error;
          }
        }
      }
      assert.equal(row.approved_schema_count, '1');
      assert.equal(row.approved_relation_count, '2');
      assert.equal(row.approved_sequence_count, '1');
      assert.equal(row.large_object_count, '1');
    }));

    await check('default read-only rejects DML and DDL with 25006', () => asBackup(async c => {
      for (const sql of ["INSERT INTO synthetic.items(label) VALUES ('DENIED')",
        "UPDATE synthetic.items SET label='DENIED'", 'DELETE FROM synthetic.items',
        'CREATE TABLE synthetic.denied(id integer)']) await denies(c, sql, '25006');
      // TEMP writes and routines have separate ACL checks; don't conflate these
      // with regular-table DML being rejected by transaction_read_only.
      await denies(c, 'CREATE TEMP TABLE denied(id integer)', '25006');
      await denies(c, 'SELECT lo_create(90003)', '42501');
    }));

    await check('even after changing read-only default, ACLs reject DML DDL roles and bypass', () => asBackup(async c => {
      await q(c, 'SET default_transaction_read_only = off');
      for (const sql of ["INSERT INTO synthetic.items(label) VALUES ('DENIED')",
        "UPDATE synthetic.items SET label='DENIED'", 'DELETE FROM synthetic.items', 'TRUNCATE synthetic.items',
        "SELECT nextval('synthetic.items_id_seq')", "SELECT setval('synthetic.items_id_seq',99)",
        'CREATE TABLE synthetic.denied(id integer)', 'CREATE TEMP TABLE denied(id integer)',
        'CREATE SCHEMA denied', 'CREATE DATABASE denied', 'CREATE ROLE denied',
        'ALTER ROLE dynapharm_backup_ro SUPERUSER', 'ALTER ROLE dynapharm_backup_ro BYPASSRLS',
        'SET ROLE rehearsal_unrelated', 'SET SESSION AUTHORIZATION rehearsal_admin',
        'SELECT synthetic.unsafe_public()', 'SELECT lo_create(90003)',
        "SELECT lo_put(90001,0,decode('00','hex'))", 'SELECT lo_unlink(90001)']) {
        await denies(c, sql, '42501');
      }
      assert.equal((await q(c, 'SELECT count(*)::integer AS n FROM synthetic.items')).rows[0].n, 2);
      assert.equal((await verify(c)).owns_no_objects, true);
    }));

    await check('mutable timeout/read-only defaults cannot masquerade as enforced ceilings', () => asBackup(async c => {
      await q(c, 'SET default_transaction_read_only = off');
      await q(c, 'SET statement_timeout = 0');
      await q(c, 'SET lock_timeout = 0');
      await q(c, 'SET idle_in_transaction_session_timeout = 0');
      const row = await verify(c);
      for (const key of ['role_read_only_default','statement_timeout_bounded','lock_timeout_bounded',
        'idle_timeout_bounded']) assert.equal(row[key], false, key);
    }));

    await check('server cancels over-limit query with 57014 at a shorter synthetic timeout', () => asBackup(async c => {
      await q(c, "SET statement_timeout = '50ms'");
      await denies(c, 'SELECT pg_sleep(1)', '57014');
      assert.equal((await q(c, 'SELECT 1 AS n')).rows[0].n, 1);
    }));

    await check('column-write grant is detected and revocable', async () => {
      try {
        await q(admin, 'GRANT UPDATE(label) ON synthetic.items TO dynapharm_backup_ro');
        await asBackup(async c => assert.equal((await verify(c)).no_table_or_column_write_privileges, false));
      } finally { await q(admin, 'REVOKE UPDATE(label) ON synthetic.items FROM dynapharm_backup_ro'); }
    });

    await check('effective PUBLIC database CREATE TEMP and schema CREATE cannot be denied per login', async () => {
      try {
        await q(admin, 'GRANT CREATE,TEMP ON DATABASE b2_role_rehearsal TO PUBLIC; GRANT CREATE ON SCHEMA synthetic TO PUBLIC');
        await asBackup(async c => {
          const row=await verify(c);
          assert.equal(row.no_database_ddl_privileges,false);
          assert.equal(row.no_schema_create,false);
          await q(c,'SET default_transaction_read_only = off');
          await q(c,'CREATE TEMP TABLE public_temp_probe(id integer)');
          await q(c,'CREATE TABLE synthetic.public_create_probe(id integer)');
        });
      } finally {
        await q(admin,'DROP TABLE IF EXISTS synthetic.public_create_probe');
        await q(admin,'REVOKE CREATE,TEMP ON DATABASE b2_role_rehearsal FROM PUBLIC; REVOKE CREATE ON SCHEMA synthetic FROM PUBLIC');
      }
    });

    await check('effective PUBLIC sequence USAGE is detected and nextval really mutates after default override', async () => {
      const before=(await q(admin,'SELECT last_value FROM synthetic.items_id_seq')).rows[0].last_value;
      try {
        await q(admin,'GRANT USAGE ON SEQUENCE synthetic.items_id_seq TO PUBLIC');
        await asBackup(async c=>{
          assert.equal((await verify(c)).no_sequence_mutation_privileges,false);
          await q(c,'SET default_transaction_read_only = off');
          await q(c,"SELECT nextval('synthetic.items_id_seq')");
        });
        assert.notEqual((await q(admin,'SELECT last_value FROM synthetic.items_id_seq')).rows[0].last_value,before);
      } finally { await q(admin,'REVOKE USAGE ON SEQUENCE synthetic.items_id_seq FROM PUBLIC'); }
      await asBackup(async c=>assert.equal((await verify(c)).no_sequence_mutation_privileges,true));
    });

    await check('large-object PUBLIC UPDATE and missing SELECT fail the fixed query', async () => {
      try {
        await q(admin,'GRANT UPDATE ON LARGE OBJECT 90001 TO PUBLIC');
        await asBackup(async c=>{
          assert.equal((await verify(c)).no_large_object_update_privilege,false);
          await q(c,'SET default_transaction_read_only = off');
          await q(c,"SELECT lo_put(90001,0,decode('00','hex'))");
        });
      } finally { await q(admin,'REVOKE UPDATE ON LARGE OBJECT 90001 FROM PUBLIC'); }
      try {
        await q(admin,'REVOKE SELECT ON LARGE OBJECT 90001 FROM dynapharm_backup_ro');
        await asBackup(async c=>{
          assert.equal((await verify(c)).large_object_select_complete,false);
          await denies(c,'SELECT lo_get(90001)','42501');
        });
      } finally { await q(admin,'GRANT SELECT ON LARGE OBJECT 90001 TO dynapharm_backup_ro'); }
    });

    await check('own role defaults are persistently mutable and fresh sessions expose the unsafe state', async () => {
      try {
        await asBackup(async c=>{
          await q(c,'SET default_transaction_read_only = off');
          await q(c,"ALTER ROLE dynapharm_backup_ro SET default_transaction_read_only = 'off'");
          await q(c,"ALTER ROLE dynapharm_backup_ro SET statement_timeout = '0'");
        });
        await asBackup(async c=>{
          const row=await verify(c);
          assert.equal(row.transaction_read_only,false);
          assert.equal(row.role_read_only_default,false);
          assert.equal(row.statement_timeout_bounded,false);
          await denies(c,"INSERT INTO synthetic.items(label) VALUES ('DENIED')",'42501');
        });
      } finally {
        await q(admin,"ALTER ROLE dynapharm_backup_ro SET default_transaction_read_only = 'on'; ALTER ROLE dynapharm_backup_ro SET statement_timeout = '120s'");
      }
      await asBackup(async c=>{
        const row=await verify(c);
        assert.equal(row.transaction_read_only,true);
        assert.equal(row.statement_timeout_bounded,true);
      });
    });

    await check('membership that permits SET ROLE is detected even with NOINHERIT', async () => {
      try {
        await q(admin, 'GRANT rehearsal_unrelated TO dynapharm_backup_ro');
        await asBackup(async c => assert.equal((await verify(c)).no_role_memberships, false));
      } finally { await q(admin, 'REVOKE rehearsal_unrelated FROM dynapharm_backup_ro'); }
    });

    await check('complete synthetic custom pg_dump and archive validation without database restore', async () => {
      const dump = await syntheticDump(cluster);
      assert.equal(dump.status, 0); assert.equal(dump.signal, null); assert.equal(dump.expired, false);
      const inspection = await inspectSyntheticArchive(cluster, dump.bytes);
      assert.deepEqual(inspection, {tables: true, sequence: true, largeObject: true, parsedWithoutDatabase: true});
      dumpEvidence = {syntheticOnly: true, exitCode: dump.status, signal: dump.signal,
        bytes: dump.bytes.length, sha256: createHash('sha256').update(dump.bytes).digest('hex'),
        elapsedMs: dump.elapsedMs, ...inspection};
      dump.bytes.fill(0); // Native archive was memory-only, never staged.
    });

    await check('observed native pg_dump clears PGOPTIONS; bounded adapter makes no server-timeout claim', async () => {
      const log = await fs.readFile(cluster.log, 'utf8'); // Owned synthetic log only; not exported.
      assert.match(log, /^b2_b2-synthetic-native-dump_.*statement: SET statement_timeout = 0/m);
      assert.match(log, /^b2_b2-synthetic-native-dump_.*statement: SET lock_timeout = 0/m);
      assert.equal(assertExternalDumpPlatform().serverQueryTimeoutEnforced, false);
    });

    await check('RLS incompleteness fails fixed verifier and native dump, never a partial PASS', async () => {
      try {
        await q(admin, 'CREATE TABLE synthetic.rls_guard(id integer); INSERT INTO synthetic.rls_guard VALUES(1); ALTER TABLE synthetic.rls_guard ENABLE ROW LEVEL SECURITY; GRANT SELECT ON synthetic.rls_guard TO dynapharm_backup_ro');
        await asBackup(async c => assert.equal((await verify(c)).no_rls_backup_gap, false));
        const dump = await syntheticDump(cluster);
        assert.notEqual(dump.status, 0);
        dump.bytes?.fill(0);
      } finally { await q(admin, 'DROP TABLE synthetic.rls_guard'); }
    });

    await check('forged or altered target and nonlocal user/database cannot reach a connection', async () => {
      await assert.rejects(localClient({...cluster, socket: '/production-not-used'}), /target-not-owned/);
      await assert.rejects(localClient(cluster, 'production-user'), /connection-scope/);
      await assert.rejects(localClient(cluster, backupRole, 'production-database'), /connection-scope/);
      assert.deepEqual(Object.keys(localToolEnvironment()).sort(), ['LC_ALL','PATH','TZ']);
    });

    await check('exact revocation/drop removes only backup login and preserves unrelated role writes', async () => {
      const before = (await q(admin, "SELECT oid FROM pg_roles WHERE rolname='rehearsal_unrelated'")).rows[0].oid;
      await q(admin, `
        ALTER ROLE dynapharm_backup_ro NOLOGIN PASSWORD NULL;
        REVOKE SELECT ON LARGE OBJECT 90001 FROM dynapharm_backup_ro;
        REVOKE SELECT ON ALL TABLES IN SCHEMA synthetic FROM dynapharm_backup_ro;
        REVOKE SELECT ON ALL SEQUENCES IN SCHEMA synthetic FROM dynapharm_backup_ro;
        REVOKE USAGE ON SCHEMA synthetic FROM dynapharm_backup_ro;
        REVOKE CONNECT ON DATABASE b2_role_rehearsal FROM dynapharm_backup_ro;
        ALTER ROLE dynapharm_backup_ro RESET ALL;
        DROP ROLE dynapharm_backup_ro;
      `);
      assert.equal((await q(admin, "SELECT count(*)::integer AS n FROM pg_roles WHERE rolname='dynapharm_backup_ro'")).rows[0].n, 0);
      assert.equal((await q(admin, "SELECT oid FROM pg_roles WHERE rolname='rehearsal_unrelated'")).rows[0].oid, before);
      const unrelated = await localClient(cluster, 'rehearsal_unrelated');
      try {
        await q(unrelated, 'INSERT INTO synthetic.unrelated VALUES(1)');
        assert.equal((await q(unrelated, 'SELECT count(*)::integer AS n FROM synthetic.unrelated')).rows[0].n, 1);
      } finally { await closeLocalClient(cluster, unrelated); }
      assert.equal((await q(admin, 'SELECT count(*)::integer AS n FROM synthetic.items')).rows[0].n, 2);
      rollback = 'PASS';
    });
  } finally {
    try {
      if (cluster) cleanup = await cleanupLocalCluster(cluster);
    } catch {
      cleanup = {status: 'FAIL', category: 'OWNED_CLUSTER_CLEANUP_FAILED'};
      throw new Error('OWNED_CLUSTER_CLEANUP_FAILED');
    } finally {
      const report = {scope: 'LOCAL_SYNTHETIC_NON_PRODUCTION', observedAtUtc: new Date().toISOString(),
        elapsedMs: Date.now() - started, setup, rollback, cleanup,
        pass: checks.filter(c => c.status === 'PASS').length,
        fail: checks.filter(c => c.status === 'FAIL').length, checks, syntheticDump: dumpEvidence,
        productionCalls: 0, providerCalls: 0, awsCalls: 0, appStorageCalls: 0,
        productionPasswordsGenerated: 0, productionModified: false, productionPublished: false,
        productionRoleCapability: 'UNVERIFIED', productionTLS: 'NOT_TESTED',
        productionRecoveryReplica: 'NOT_CONTACTED', rpoRto: 'UNPROVEN',
        operationalDump: 'SOURCE_BINDING_UNVERIFIED',
        note: 'PUBLIC hardening was fixture-only; production changes remain prohibited. No actual database restore performed.'};
      report.verificationSqlSha256=createHash('sha256').update(verifySQL).digest('hex');
      report.planSha256=createHash('sha256').update(await fs.readFile(
        new URL('../docs/b2-backup-login-plan.md',import.meta.url))).digest('hex');
      report.readOnlyEnforcement='SCOPED_EFFECTIVE_ACLS_AND_MUTABLE_DEFAULTS_NOT_UNIVERSAL_IMMUTABLE_ENFORCEMENT';
      await fs.mkdir(evidenceDir, {recursive: true});
      await fs.writeFile(new URL('results.json', evidenceDir), JSON.stringify(report, null, 2) + '\n');
    }
  }
});
