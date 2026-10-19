# Dedicated backup login — non-executing production change plan

## Status and scope

**PREPARED ONLY / EXECUTION BLOCKED pending provider capabilities and owner confirmation.**

**Bounded-adapter update:** the external-deadline adapter requires one reserved monitoring
connection plus one serial pg_dump connection to the same direct recovery server. The
one-connection login/verification specification retained below is historical preparation,
not a currently executable plan for that adapter. A revised reviewed two-connection plan
and fresh owner approval would be required; no role, credential, PUBLIC or connection-limit
change is authorized or performed. See `b2-production-recovery-source-support-request.md`
and `../generated-artifacts/b2-bounded-logical-backup/report.md`.
No production call, role creation, password generation, secret write or credential rotation has
occurred. This is not a migration or deployment hook. Do not run it through Publish, application
startup, the managed read-only SQL interface, or an unverified workspace connection.

Proposed new cluster role: `dynapharm_backup_ro`. Never reuse or change the application login.
One approved production database, explicitly frozen application schemas and existing relations,
one serial dump connection, one backup session, credential validity at most two hours.
No ownership, role membership, administrative/bypass privilege, object creation or application writes.

This plan does **not** claim that PostgreSQL can make a user-changeable read-only default immutable.

### Isolated restriction/revocation evidence

`scripts/backup-login-rehearsal.test.mjs` executes the fixed verification SQL on a
fresh, owned Unix-socket-only PostgreSQL cluster. It uses generated synthetic
records, local trust scoped by a private directory, and no production password
or existing application connection. Results and input hashes are retained under
`generated-artifacts/b2-backup-login-rehearsal/`.

The rehearsal independently exercises effective PUBLIC CREATE/TEMP/schema
CREATE, executable routines, membership/SET ROLE, sequence mutation, large-object
creation/read/write ACLs, RLS dump failure, and persistent self-alteration of role
defaults. Unsafe catalog checks must return false, not become a partial PASS.
After fixture-only PUBLIC hardening, explicit ACL denials survive disabling the
mutable read-only default. A native memory-only synthetic dump is decoded without
restoring a database. Role cleanup uses exact grants/revocations and DROP ROLE,
never DROP OWNED or CASCADE; unrelated role identity and permitted writes survive.

This is not a production capability attestation. Effective PUBLIC privileges
cannot be overridden by a per-role DENY. Any unsafe PUBLIC/routine/extension
path on a real target is a stop, not authority to change shared policies.
Provider custom-login permission, independently verified recovery/replica support,
TLS verify-full and complete backup visibility must be established separately
before any production confirmation. Catalog absence assertions remain scoped
observations, not a proof against every possible provider-specific side effect.
The enforceable boundary is object privileges plus a verified physical recovery replica.
The existing `pg_is_in_recovery()=true` gate remains mandatory. A new login on a primary alone
does not resolve the blocked backup-source binding.

## What documentation establishes

Consulted on 2026-10-18; no production inspection was performed:

- Replit documents production connection information in Database > select production > Settings
  and using external PostgreSQL tools. It does not expressly document customer `CREATEROLE`,
  whether this project's backend permits custom logins, or direct recovery-replica access.
- The managed Agent production SQL interface is SELECT-only. Its safety restriction is not proof
  that an owner/provider administrator lacks PostgreSQL role-creation capability.
- A broad documentation-search response initially asserted custom roles/replicas were unavailable.
  Direct official-page review and a targeted clarification did not substantiate that assertion.
  **Do not treat it as a provider capability determination.**
- PostgreSQL supports non-superuser logical dumps with sufficient object read privileges.
  `pg_dump` cannot connect using only the managed SELECT-result interface.
  A direct, provider-supported TLS connection and valid credential are required.
- PostgreSQL `CREATE ROLE` needs suitable administrative authority. A role is cluster-wide,
  not confined to one database by its name or default settings.
- `default_transaction_read_only` is a default, not a write-prevention guarantee.
  TLS `verify-full` is a client requirement, not a PostgreSQL role attribute.
  Connection-establishment timeout is a client setting, not a role setting.

Sources:

1. https://docs.replit.com/features/data-and-storage/connection-details
2. https://docs.replit.com/features/data-and-storage/sql-database
3. https://docs.replit.com/features/data-and-storage/development-and-production
4. https://www.postgresql.org/docs/current/sql-createrole.html
5. https://www.postgresql.org/docs/current/runtime-config-client.html
6. https://www.postgresql.org/docs/current/app-pgdump.html
7. https://www.postgresql.org/docs/current/libpq-ssl.html

## Mandatory gates before requesting the single execution confirmation

These are proposed future checks, not calls authorized or performed by this preparation.

1. Obtain provider-confirmed support for a separate customer backup role on the exact production
   cluster and a supported administrator-only provisioning route. Establish actual CREATEROLE,
   grant authority, policy constraints, PostgreSQL version, and rollback authority. No capability
   probing or production SELECT was made in this preparation.
2. Bind the exact production resource and its recovery replica using authoritative provider
   metadata in a private executor. Verify recovery status and independently match the endpoint
   to that resource. Host/database names alone, source labels, deployment existence and generic
   database-name equality are insufficient.
3. Privately freeze the database/schema/object grant scope and its catalog counts. Confirm role
   name absent; an existing same-name role is a conflict, never automatically adopted or altered.
4. Confirm no effective PUBLIC or indirect write/DDL pathway for the proposed role:
   database CREATE/TEMP, schema CREATE, table/column write permissions, sequence USAGE/UPDATE,
   role membership/SET ROLE, unsafe executable routines, object ownership, other database access
   or provider-extension administrative powers. PostgreSQL has no per-role DENY overriding PUBLIC.
   Revoking a direct role grant does not remove a PUBLIC grant.
   Include PUBLIC UPDATE on pg_catalog.pg_settings and PUBLIC EXECUTE on built-in
   lo_create/lo_from_bytea/lo_import: table SELECT-only grants alone do not prevent
   these paths. The synthetic fixture revoked these only in its new disposable
   cluster; that is not permission to change production PUBLIC privileges.
5. If meeting that policy would require changing PUBLIC, application grants, owners, routines,
   schema defaults, RLS policies or other databases, **STOP**. Those are not this minimum change.
   A verified recovery replica still prevents persistent writes, but must not be reported as
   having eliminated excessive effective ACL privileges.
6. Confirm full native dump visibility without granting BYPASSRLS or ownership. Any applicable
   RLS table blocks this strict plan; never use `--enable-row-security` to silently accept a
   partial dump. Check SELECT on sequences and all large objects as well as tables. Foreign
   tables/external data require separate completeness treatment; do not discover external data
   sources or add permissions implicitly.
7. Establish an approved private password-provisioning executor or provider UI that can create
   the credential and save it directly to a protected secret without returning it to Agent.
   Document whether the provider logs role-management statements/parameters or verifiers.
   If no such route is verified, stop. `requestSecrets` supports secure owner entry but is not an
   automatic password generator or a verified database-role provisioning service.
8. Prepare rollback in the same independently bound administrator context, including authority
   to disable only the new login, terminate only its sessions, revoke only its grants, drop only
   that role, and remove/revoke its newly created protected secret. Never rotate the app password.
9. Freeze a short execution window, operator, two-hour expiry, connection/resource bounds,
   evidence sink and stop rules. Obtain the exact confirmation at the end of this document.

No credential is to be generated before these gates pass and the owner confirms.

## Exact sanitized future execution sequence

### 1. Recheck the frozen scope; no credential yet

Use the privately bound provider administrator, not the workspace DATABASE_URL.
Read only fixed catalog metadata needed to revalidate the above gates. No business rows.
Return booleans/counts and server/tool versions only. Stop on changed target/scope or missing
authority. Recheck the owner confirmation's scope and expiry immediately before any mutation.

### 2. Generate the new credential inside the protected workflow

Only after the single confirmation: generate at least 32 bytes of CSPRNG entropy in the approved
secret workflow/password manager. Store directly in the new dedicated protected secret or
private provisioning executor. Never put it in a shell command, SQL source/template, environment
dump, history, evidence, clipboard shared with Agent, source repository, report or chat.
No password, URL, password hash/verifier or key is to be returned to Agent.

Do not call the application's existing credential-regeneration action: it can invalidate the app
connection and trigger production deployment behavior. That is expressly outside this plan.

The role statements below deliberately contain **no PASSWORD operand**. Activation and
SCRAM-SHA-256 verifier installation must be performed by the separately reviewed protected
provider/executor route, with sensitive SQL/parameter/statement logging excluded. A password
placeholder substituted into a .sql file or shell command is not an acceptable implementation.

### 3. Create only the dormant role, defaults and frozen grants

**NOT EXECUTED.** The following is a sanitized statement specification, not a runnable migration.
Quoted placeholders must be resolved as validated identifiers by the private executor.
No placeholder is a credential. Unresolved placeholders, unavailable privileges or an existing
role cause a stop. Do not attempt a privileged fallback.

```sql
BEGIN;
CREATE ROLE dynapharm_backup_ro
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 1 PASSWORD NULL;

ALTER ROLE dynapharm_backup_ro SET default_transaction_read_only = 'on';
ALTER ROLE dynapharm_backup_ro SET statement_timeout = '120s';
ALTER ROLE dynapharm_backup_ro SET lock_timeout = '5s';
ALTER ROLE dynapharm_backup_ro SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE dynapharm_backup_ro SET search_path = 'pg_catalog';

GRANT CONNECT ON DATABASE "<APPROVED_DATABASE>" TO dynapharm_backup_ro;
-- Repeat only for each already-frozen approved application schema:
GRANT USAGE ON SCHEMA "<APPROVED_SCHEMA>" TO dynapharm_backup_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA "<APPROVED_SCHEMA>" TO dynapharm_backup_ro;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA "<APPROVED_SCHEMA>" TO dynapharm_backup_ro;
-- Only if large objects exist: one SELECT grant per frozen large-object OID.
-- GRANT SELECT ON LARGE OBJECT <APPROVED_LARGE_OBJECT_OID> TO dynapharm_backup_ro;
COMMIT;
```

All grants are read-only and without grant option. No pg_read_all_data, pg_monitor, membership,
superuser, replication, bypass, role administration, schema ownership or table ownership.
No `ALTER DEFAULT PRIVILEGES`: this one-run plan does not alter future application privileges.
Detect new relations/schema drift before dumping and fail closed rather than grant dynamically.

### 4. Install the protected verifier, expiry and activate only the new login

The protected provider/executor installs the password verifier, sets `VALID UNTIL` to the frozen
UTC start + at most two hours, and enables LOGIN. Do not expose a generated ALTER ROLE statement.
Keep LOGIN disabled until grant/attribute verification succeeds. If protected installation or
secret saving fails, invoke the role-only rollback; do not leave an unrecorded usable credential.

A protected SCRAM verifier is still sensitive material; do not print or export it.
Use a provider-supported HBA/identity path that accepts this custom SCRAM login on the replica.
Do not change authentication or TLS configuration to accommodate it.

### 5. Fixed post-creation verification — zero business rows

Open a **fresh** connection as the new login over the independently bound replica endpoint.
Use `sslmode=verify-full`, the reviewed readable absolute system CA bundle, and `connect_timeout=10`.
For the first role-default verification, omit PGOPTIONS and startup overrides: they must not fake
the role's default read-only/timeouts. Do not reuse an administrator connection with SET ROLE.
The private verifier must compare authenticated TLS endpoint and provider resource metadata to
the approved target, then run the single fixed statement in
`b2-backup-login-verification.sql`. Bind `$1` to the private expected database name and `$2` to
the frozen schema-name array. Never include parameter values in evidence.

Every returned boolean must be true; the client must separately require exactly one result row,
correct TLS host/chain verification, expected version and expected frozen catalog counts.
`has_*_privilege` catalog checks prove scoped effective privilege absence, not universal absence
of every conceivable provider-specific side effect. A replica and reviewed routine/extension
policy remain essential. No real INSERT/UPDATE/DELETE/DDL or rolled-back write probe is permitted.

The fixed statement does not invoke application functions or read application table contents.
If ACL/RLS/routine/foreign-object checks fail, disable/revoke/drop only the candidate-owned role.
Do not fix the failure by broadening privileges or changing app/PUBLIC policies.

### 6. Check actual pg_dump compatibility without claiming full recovery

After successful identity/default/privilege verification:

- Check local pg_dump/pg_restore version offline; require both the same major as the privately
  observed production server for this conservative candidate. `pg_dump` is not permitted to be
  older than the server. Confirm client auth and server extension compatibility.
- A native full custom-format dump under separate existing guarded backup authority, streamed
  directly into authenticated ciphertext staging, is required to prove actual full dump access.
  A version check or schema-only dump alone is not proof.
- No table/schema exclusion, `--enable-row-security`, large-object exclusion, privilege/bypass
  escalation, disabling SSL, or silent retry is allowed. Require zero exit, complete scoped
  catalog coverage, valid archive header and full pg_restore decode through memory streams.
- The previous 600-second PGOPTIONS override is removed. Fixed ceilings are now 10-second
  connect/preflight, 120-second statement, 5-second lock and 30-second idle transaction.
  However, native PostgreSQL 16.10 pg_dump was observed clearing statement_timeout and
  lock_timeout to zero after login. Neither PGOPTIONS nor role defaults enforce a native dump.
  The candidate now implements an external process deadline plus deterministic owned-tree
  termination and backend cancellation/absence verification. It does NOT claim server-query
  timeout enforcement. Unconfirmed termination/cancellation/cleanup prevents success/upload.
  Production remains blocked with SOURCE_BINDING_UNVERIFIED at tool/source/dump entry,
  without a flag/environment bypass. Default validation still makes no provider calls.
- A timeout/replica recovery conflict can abort a large dump; stop and report it, never relax
  limits automatically. The candidate dump-process watchdog is capped at 120 seconds, but is
  not itself represented as server-side cancellation. Cancellation is independently verified
  using the reserved monitor; no parallel dump workers are allowed.
- A full backup contains confidential data even though no rows are displayed. Existing guarded
  manifest, KMS, ciphertext checksums, immutable retention and isolated restore gates still apply.
  A database login supplies no missing App Storage/legacy completeness or native restore evidence.

## Explicit rollback — only the new login and its grants

Rollback is prepared, **not executed**. Run only against the independently approved cluster,
under the specifically authorized provider administrator. Verify this attempt created the role
and owns its grant ledger; never adopt an existing role or infer ownership from its name alone.

1. Disable just the new login and erase its server-side password:

```sql
ALTER ROLE dynapharm_backup_ro NOLOGIN PASSWORD NULL;
```

2. Disable/remove its newly created protected secret in the supported secret workflow, never the
   application DATABASE_URL or other existing secret. Expiry/NOLOGIN do not close existing sessions.
3. Close owned client connections. If needed, with the planned rollback authority terminate only
   sessions with the **recorded new role OID**, connected to the approved database and tagged
   application name. Never terminate application sessions or all connections.
4. Using the frozen grant ledger, revoke the role's SELECT grants on every approved large object,
   tables and sequences; schema USAGE; database CONNECT. Revoke any accidental direct privileges
   from this new role only; an unexpected dependency is a stop condition requiring review.

```sql
-- Repeat only for the frozen approved objects/schemas/database:
-- REVOKE SELECT ON LARGE OBJECT <APPROVED_LARGE_OBJECT_OID> FROM dynapharm_backup_ro;
REVOKE SELECT ON ALL TABLES IN SCHEMA "<APPROVED_SCHEMA>" FROM dynapharm_backup_ro;
REVOKE SELECT ON ALL SEQUENCES IN SCHEMA "<APPROVED_SCHEMA>" FROM dynapharm_backup_ro;
REVOKE USAGE ON SCHEMA "<APPROVED_SCHEMA>" FROM dynapharm_backup_ro;
REVOKE CONNECT ON DATABASE "<APPROVED_DATABASE>" FROM dynapharm_backup_ro;
ALTER ROLE dynapharm_backup_ro RESET ALL;
DROP ROLE dynapharm_backup_ro;
```

No DROP OWNED, CASCADE, REASSIGN OWNED, schema/data deletion, production object changes, global
PUBLIC revocation or password regeneration. Verify role/grants absent, dedicated secret disabled,
and no owned session left. If DROP is blocked, leave NOLOGIN/PASSWORD NULL, record rollback
incomplete, preserve the exact scoped dependency evidence privately, and stop. Do not broaden cleanup.
The login is cluster-wide: a role drop requires confirmation that no other database dependency
was introduced. It is not a production database rollback or a restore.

## Risks and unresolved capability checks

- Provider custom-role/HBA/replica/admin support is unverified; owner confirmation cannot supply
  missing platform capability. Do not execute generic PostgreSQL SQL speculatively.
- Role defaults and client TLS options are not immutable role-level enforcement.
- PUBLIC privileges can make the strict no-write/no-DDL policy impossible without unrelated changes.
- RLS without bypass, unreadable large objects, foreign data, new schemas/relations or provider
  extensions can make an apparently successful limited backup incomplete.
- Short timeouts/standby conflicts may stop legitimate backups; fail safely, no hidden relaxation.
- The login can read all approved business data; restrict runner/network access and its validity.
- Data backup consistency, storage completeness, restore compatibility and RPO/RTO are separate gates.
- The protected generator/provisioner has not been established; no password was generated today.
- Dropping a login must not leave its credential usable through already-open sessions or replicas.

## Single confirmation — request only when every prerequisite above is ready

Do not request or treat this preparation as execution approval. Immediately before credential
generation and the first production mutation, obtain exactly this scoped confirmation:

> I authorize one-time creation of dynapharm_backup_ro on the independently verified approved
> production cluster, with only the reviewed CONNECT/USAGE/SELECT grants and role defaults,
> protected generation and storage of a credential valid for at most two hours, non-mutating
> verification on its approved recovery replica, and rollback of only this newly created login,
> its grants, secret and sessions if any gate fails. I do not authorize changing PUBLIC or
> application privileges, existing credentials or sessions, production rows, publication,
> restart, migrations, schedulers or workers.

Bind this confirmation privately to the exact provider target, frozen grants, operator, expiry
and cleanup plan. No secret belongs in the confirmation. If any prerequisite is unresolved,
return BLOCKED instead of asking for an approval that cannot safely be executed.
