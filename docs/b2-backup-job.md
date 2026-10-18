# B2 candidate-only manual backup job

## Current authority and scope

This job is **not activated**. Current authority covers candidate code, local/offline tests and
candidate/development-only configuration plus validation. No production configuration is changed.
No scheduler, application import, deployment hook or new dependency is added.
Existing `.replit` changes, including any persisted awscli2 setting, are unrelated and must be left untouched.

The default future execution path is a **single PostgreSQL database logical backup to an existing protected S3 bucket**.
An optional, separately gated candidate extension captures only App Storage objects in a supplied authorized manifest;
it never discovers objects or queries business rows for references. Neither mode captures filesystem uploads,
seven legacy or four unclassified references, cluster-global roles, configuration/keys or a verified cross-resource
recovery watermark. Neither mode closes B2 or establishes RPO/RTO.
All 49 general App Storage references and 19 staff-document references still require the separately authorized
whole-bucket/reference recovery work in `generated-artifacts/b2-storage-recovery-plan/report.md`.
The existing `/uploads` route and historical references are unchanged.

## Default: validation only, zero calls

Run `node scripts/backup-job.mjs` or append `--dry-run`.
The core checks protected configuration syntax in memory. The CLI additionally validates the local
system CA bundle and private ciphertext staging directory when syntax is valid.
It does not load the operational I/O adapter, spawn tools, query a database or contact a provider/storage API.
Local checks read only system trust and filesystem metadata, never upload files or application data.
Tool availability is explicitly `NOT_PROBED`; no version command runs in this mode.
Logs/results are allowlisted JSON; values, raw arguments, URLs, bucket names, private paths, stderr and stacks are not printed.
Exit codes: 0 valid dry-run or completed backup; 2 incomplete/invalid dry-run configuration; 1 blocked/failed execution.

Configured AWS secrets or environment variables claiming approval do not enable execution.
If `B2_BACKUP_DATABASE_URL` is absent (not merely empty), use the already injected `DATABASE_URL`
directly in memory. Neither input is printed, persisted, fingerprinted or added to evidence.
Do not paste credentials or connection strings into chat/commands.

## Future owner-operated execution gates — NOT AUTHORIZED NOW

Both flags must be supplied explicitly:
- `--execute-owner-approved`
- `--acknowledge-backup-writes-and-30-day-retention`

One flag alone, conflicting/unknown flags or attempting retention bypass is rejected before I/O.
The adapter independently requires both flags. These gates are not a substitute for target-specific owner authority.
Do not run the two-flag invocation as part of this change or to discover its effect.

Required privately provisioned configuration names (no values in evidence):
- `B2_BACKUP_DATABASE_URL`: optional protected override; otherwise consume injected `DATABASE_URL`.
  Never copy the protected value to another setting. An invalid explicit override fails closed.
- `B2_BACKUP_SOURCE_CLASS`: `production` or `isolated`.
- `B2_BACKUP_PG_ROOT_CERT`: optional absolute system trust-store path, fixed to
  `/etc/ssl/certs/ca-certificates.crt` (also the default). It is not PEM content and is not a secret.
  Require readable, parsable CA certificates in a non-group/world-writable system bundle.
  Production PostgreSQL connections always use `verify-full` / `rejectUnauthorized: true`;
  Every recognized URI sslmode (including `disable`/`allow`/`prefer`) is overridden with
  `verify-full`, never copied into production transport options. A source that cannot negotiate
  verified TLS fails at execution preflight; validation does not contact it or claim TLS success.
  Unknown modes, arbitrary trust paths, missing or malformed bundles fail closed.
- `B2_BACKUP_OUTPUT_DIR`: existing canonical private direct child `/tmp/b2-ciphertext-<uuid-v4>`,
  owned by the operator with mode 0700 and outside project/served paths. Only ciphertext is staged.
- `B2_BACKUP_CIPHERTEXT_ONLY_CONFIRMED=true`: acknowledge the reviewed application-level
  no-plaintext-staging contract. The old `B2_BACKUP_ENCRYPTED_OUTPUT_CONFIRMED` does not satisfy
  this guard. No filesystem encryption assertion is made.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_SESSION_TOKEN`, `AWS_BACKUP_BUCKET`, `AWS_REGION`.
- `B2_BACKUP_KMS_KEY_ARN`: full regional KMS key ARN used explicitly on every uploaded object.
- `B2_BACKUP_GOVERNANCE_NO_BYPASS_CONFIRMED=true`: owner assurance that backup/restore/operator IAM policies
  deny Governance bypass and unauthorized retention changes. The job does not inspect or alter IAM.
- For isolated source configuration, `B2_BACKUP_TEST_OWNER`: 32 lowercase hex characters; source must be loopback,
  an explicit non-5432 port and database `b2_backup_test_<owner>`. These markers alone do not prove ownership;
  the future operator must attest the target separately.

**Tests never use a production source.** The real adapter refuses every node:test/Vitest/test runtime,
even an isolated loopback configuration. Unit tests use memory fakes only for execution stages.
No escape flag permits real test uploads. Real isolated rehearsal requires separate non-test owner-operated authority.

After both gates, execution checks local trust/staging, matching-major `pg_dump`/`pg_restore` and AWS CLI v2 with required
conditional-write/checksum/retention capabilities. Use trusted, owner-reviewed executable paths.
The child environment drops ambient AWS endpoints/profiles/metadata credential discovery, PG services/options
and preload settings. Credentials are supplied privately by environment, not connection-string command arguments.
Subprocess stderr is drained without logging or retaining it; failures have fixed safe categories.
Before any dump, a bounded PostgreSQL catalog-only `BEGIN READ ONLY` preflight requires
`transaction_read_only=on`, `pg_is_in_recovery()=true`, and `current_database()` equality to the
privately selected source database name. Only boolean results return; no business rows or raw identity
are selected. A primary/writable database is refused, not relabelled as a valid replica.
The check does not prove a separately authorized production target or recovery point;
future execution still requires owner confirmation of the actual injected deployment source.

## Artifact, manifest and completeness protocol

- UTC local directory: `<protected-root>/YYYYMMDDTHHMMSSmmmZ_<uuid-v4>/`.
- S3 prefix: `b2/database/YYYY/MM/DD/YYYYMMDDTHHMMSSmmmZ_<uuid-v4>/`.
- A new 0700 run directory is exclusively created; all 0600 artifact/partial files contain only
  `B2GCM001` encrypted envelopes, never a plaintext dump, source object or private manifest.
- Generate a random 256-bit data key only in memory. KMS `Encrypt` wraps the key via binary stdin;
  only the wrapped blob is retained in each authenticated envelope header. No plaintext key file.
  This direct KMS permission path has not been exercised by validation or offline tests;
  historical S3-context IAM simulation is not proof of direct KMS wrapping permission.
- A fresh 96-bit nonce per file and AES-256-GCM protect source bytes incrementally before
  filesystem writes. Header and artifact basename are authenticated as AAD; the 128-bit tag is last.
  Dump stdout and exact-object source streams go directly into encryption, with bounded sizes.
- `pg_dump` uses custom format, no interactive password, a read-only transaction default, bounded timeouts
  and no include/exclude filters. A nonzero exit never proceeds to artifact upload.
- Require a custom-archive header; `pg_restore --list` and a **full archive decode to `/dev/null` without
  database credentials or a database destination** must both pass. Table-of-contents validation alone is insufficient.
  Authenticate the complete encrypted archive first, then decrypt to process stdin only for the
  list/decode passes. No `pg_dump --file` or plaintext `pg_restore` input file is created.
- Reject zero-byte, nonregular, symlinked, multiply linked, changing or >5,000,000,000-byte artifacts.
  This single-PutObject implementation intentionally does not support larger/multipart backups.
- Compute ciphertext SHA-256 by streaming locally, authenticate/recheck immediately before upload, use S3 full-object SHA-256 validation,
  conditional create (`If-None-Match: *`), KMS encryption and explicit retention.
- Verify the exact returned object version with HeadObject: size, checksum, version, KMS key and retention.
- Write/upload in order: `database.dump`, `manifest.json`, `SHA256SUMS`, `COMPLETED.json`.
  Completion is last and links manifest/checksum-file hashes. No final success before every verification passes.
- Manifest schema: `docs/schemas/b2-backup-manifest.schema.json`.
  Manifests/version identifiers/dump checksums are protected recovery material, not public evidence.
  Public logs contain only event/time/mode/stage/status/fixed error codes.
- Always clean exclusively owned temporary ciphertext after success/failure and zero the in-memory
  data-key buffer. Verify inode/device/file type/link count and never recursively delete or adopt
  foreign files. Cleanup failure is explicit and prevents reporting a clean success.
  Unlinking ciphertext is not a promise of physical secure erasure or crash-proof cleanup.
  A killed process can leave ciphertext requiring separate operator-owned recovery/cleanup.
  There is no remote delete or failed-upload cleanup.
  A lost completion acknowledgement means verification is unconfirmed, not permission to delete or blindly overwrite.
  A new manual run has a fresh prefix; it is a new backup, not a hidden retry of an existing object.

## Thirty-day Governance retention is treated as immutable

The existing destination must have versioning and Object Lock enabled with a 30-day **GOVERNANCE** default.
The job does not create/configure buckets, change retention or offer a bypass/delete operation.
Every object requests at least 30 days plus a one-minute clock/transfer safety margin; verification requires
expiry at least 30 days after the provider's `LastModified`. Excessive clock/transfer skew fails verification.

Governance is technically bypassable by separately privileged principals; it is **not Compliance mode**.
The operating policy must deny that bypass and treat all resulting versions, including partial runs and synthetic
objects if anyone later authorizes them, as immutable until their actual retention expiry.
Do not promise cleanup before expiry; key destruction must not be used as a workaround.
No test object is uploaded by this implementation/test run. Local memory fixtures have no S3 retention.
This Governance choice supersedes the earlier non-executing plan's proposed Compliance mode for this job only.

## Future isolated restore instructions — do not execute now

1. Obtain separate restore/data-decryption authority and a supported, positively identified disposable DB/storage/runtime.
   Never point restore tools at the production instance; isolate network, domains, credentials and all outbound side effects.
   Assign accepted operators, key custodians and a cleanup owner before starting.
2. Start the RTO clock before allocation/access/backup discovery. Select a protected completed run and exact versions.
    Privately download only authorized ciphertext versions into an isolated private area; retain backup versions untouched.
3. The `B2GCM001` reader must validate the 8-byte magic, big-endian 4-byte header length (<=20,000),
    JSON header (`format`, wrapped KMS key, base64 12-byte IV), ciphertext and final 16-byte GCM tag.
    Obtain separate KMS decryption authority; unwrap the key in memory only. AAD is
    magic + length + exact header bytes + original artifact basename. Authenticate a full pass before
    releasing plaintext into any restore tool. Do not infer encryption from a filename extension.
    Require/decrypt completion marker and manifest, verify their ciphertext hashes and checksum-file hashes, validate the manifest schema,
   then verify every `SHA256SUMS` entry against the downloaded bytes. Reject missing, partial or inconsistent runs.
    All artifact hashes/sizes and completion links refer to ciphertext; original source content
    hashes remain inside the encrypted authorized object manifest.
    The restore verifier must restrict entries to fixed expected basenames, not execute arbitrary manifest paths.
    The earlier synthetic JSON rehearsal is NOT an end-to-end test of this encrypted native format.
4. Re-run full archive decode locally, then restore into the explicitly owned isolated database using reviewed
   restore roles/options and isolated credentials. Do not rebind production, run historical repair or restore revoked
   production sessions as active test access. Restore required globals/config separately only if expressly authorized.
5. Restore the separately protected App Storage/legacy data into isolated storage and validate the common DB/object
    recovery point and access policy. Manifest object mode covers only its authorized listed references:
    **a database-only or partial-reference restore is not complete B2 recovery**.
6. Use synthetic staff tests and private aggregate/integrity validators, strict startup, no seeds/migrations/jobs.
   Stop the RTO clock after all required validation. Record RPO <=15 minutes and RTO <=60 minutes only with complete
   provider-confirmed cross-resource evidence; this job's dump times do not establish either objective.
7. Clean only explicitly owned disposable resources under cleanup authority. Do not delete retained S3 versions
   or alter their retention. Protect local sensitive artifacts until authorized secure disposal.

## Local/offline test command

`node --test scripts/backup-job.test.mjs scripts/backup-object-manifest.test.mjs`

This follows the repository's standalone `scripts/*.test.mjs` convention; those files are deliberately outside
the application's Vitest unit project. No package/lockfile or workflow change is necessary.

## Optional authorized-manifest App Storage candidate stage

**No operational execution or live object inspection/upload is authorized by this implementation.**
RPO/RTO remain unproven and B2 remains open. The old database-only gates and version-1 manifest contract remain valid.

### Supplied input, never discovery

Use `--with-app-storage` to request this scope. Its default remains validation-only; it also works with `--dry-run`.
Supply an already privately authorized manifest as an immutable JSON string through the programmatic
`runBackup({objectManifestJson, ...})` boundary or `B2_BACKUP_OBJECT_MANIFEST_JSON`.
There is deliberately **no file-path, URL, stdin-fetch, database-query or object-list discovery option**.
Do not paste a real manifest into a command line, chat, logs or review evidence.

Input schema: `docs/schemas/b2-authorized-object-manifest.schema.json`, enforced with additional semantic checks
by `scripts/lib/backup-object-manifest.mjs` before loading an I/O adapter.
The separately authorized issuer supplies:
- Version 1; a UUID-v4 backup-set ID; an authorization ID, explicit exact-object-only scope, issued and expiry times.
- Provider, explicit bucket identity, bound database-identity fingerprint, reference-snapshot digest and capture time.
- Per object: exact key, nonzero expected stored-byte length, `content-sha256` identity and approved source columns.
  No primary keys, business rows, customer/staff names, arbitrary URLs or discovery instructions are permitted.

Wire representation must be the exact compact output of `JSON.stringify`, without surrounding whitespace.
This rejects duplicate JSON properties and ambiguous escaping. Pin the exact UTF-8 bytes independently using:
- `B2_BACKUP_OBJECT_MANIFEST_SHA256`.
- `B2_BACKUP_APP_STORAGE_BUCKET_SHA256`: SHA-256 of `replit_app_storage:` followed by the exact supplied bucket ID.
- `B2_BACKUP_DATABASE_IDENTITY_FINGERPRINT`: expected fingerprint attested by the separate issuer.

The job verifies pins, structure and times in memory; freezes parsed metadata; and never invents/refreshes an
authorization or expected checksum. These pins bind inputs, **not a live provider attestation or signature**.
The operator must approve the independent issuer/target linkage. Execution additionally uses the
boolean-only database identity/read-only preflight described above; validation never queries it.
The issuer must retain the original authorized manifest in an approved protected recovery location before any
future execution, so partial runs remain privately mappable. This job does not retrieve that retained copy.
Date strings must use exact UTC millisecond `Date.toISOString()` representation.

Only these source column/prefix associations are accepted:

| Source column | Exact prefix |
|---|---|
| `file_uploads.file_url` | `public/uploads/` |
| `product_images.image_url` | `public/uploads/` |
| `product_images.thumbnail_url` | `public/uploads/` |
| `distributors.photo_url` | `public/uploads/` |
| `staff_documents.file_url` | `staff-documents/` |
| `client_history_attachments.object_name` | `client-history-private/` |

Private prefixes remain private recovery material, not a request to make their contents public.
Keys must be relative, ASCII, <=512 characters and composed of approved nonempty segments. Reject dot/hidden
segments, traversal, encoding (`%`), URLs, queries/fragments, backslashes, whitespace and duplicate keys.
Shared references to the same object belong in one unique-key entry with unique allowed columns.
Reject unknown columns, wrong-prefix associations and extra fields; do not broaden policy to make an export pass.

Limits: 65,536 manifest bytes, 1–256 objects, 1–268,435,456 bytes per object, <=2,147,483,648 bytes total.
Issued <= captured <= current time < expiry; authority may span no more than 24 hours.
Expiry is rechecked during capture and before completion. Oversized scopes need a separately reviewed design,
not disabled limits or an implicit partial-success manifest.

### Third acknowledgement and independent operational enforcement

Object execution additionally requires `--acknowledge-authorized-object-manifest`, alongside both existing
owner/30-day-retention flags and the object scope flag. No environment value substitutes for these flags.
The real adapter independently rechecks all flags, exact manifest/pins, bounds, scope and freshness before
it can load the SDK. Its unconditional real-I/O refusal in test runtimes still applies.

Only the supplied explicit bucket is constructed. The sole source-data operation is an exact
`downloadAsStream(expected.key, {decompress: false})` for a validated entry index; there is no list or row-query
method. Capture has a size bound and a timeout capped by authority expiry, writes only an authenticated
ciphertext partial staging file, hashes raw stored bytes in memory, and renames only after exact size/hash match.
No source file in the legacy `/uploads` filesystem is read.

The installed SDK exposes no historical-generation selector here. Source identity is therefore pinned content,
not a claim to fetch a historical native generation. Changed/missing content fails closed; never accept a new
hash on retry. Original content headers/ACL metadata and full-bucket/orphan coverage are not established by
this limited column-reference manifest stage and still require separately approved recovery work.

### Backup-set links, protection and partial failure

Each captured object uses an opaque ordinal basename (`object-000001.bin`, etc.) under the existing run prefix.
Every destination uses the same conditional create, SHA-256, exact returned S3 version, KMS verification and
30-day Governance minimum as the database artifact. No deletion, bypass or retention reduction is added.

Upload order: database artifact; all verified object artifacts; protected original `object-manifest.json`;
version-2 `manifest.json`; `SHA256SUMS`; `COMPLETED.json` **last**.
The latter two link every payload and the input/backup-manifest digests.
The encrypted input manifest is the private mapping from ordinal payloads to source keys.
Keys, bucket identifiers, hashes, manifest contents, URLs and provider errors are never returned in public logs.

Version-2 schema: `docs/schemas/b2-backup-set.schema.json`. It binds the database ciphertext SHA-256,
encrypted supplied-manifest SHA-256, backup-set ID, bucket/database/reference-snapshot fingerprints,
source counts/bytes and capture intervals. Per-artifact `bytes` and `sha256` always describe ciphertext
when `encryption` is present; source counts/bytes describe original input. Envelope overhead does not
broaden the source-object size limit. Older synthetic fixtures without `encryption` remain legacy
schema-compatibility tests, not current encrypted-backup restore evidence.
It explicitly records `crossResourceAtomicity=false`, `providerSnapshotVerified=false`, an owner-attested
identity basis and unproven RPO/RTO/full-B2 status. Time intervals/digests do not create a consistent SQL/object snapshot.

On a missing, truncated, mutated, oversized or failed object, stop the set without a completion marker.
Clean only the exclusively owned local ciphertext; never clean retained remote versions.
Already protected versions/partial runs remain immutable until actual retention expiry; no early cleanup promise.
Never label the surviving subset a complete recovery point or retry by overwriting an existing key.

For a future separately authorized isolated restore, additionally verify completion/input-manifest/set links,
all object checksums, declared counts/bytes and exact version metadata before restoring any references.
Restore only to positively isolated target storage using a reviewed restore adapter: map ordinal files back to
validated original keys without treating keys as local filesystem paths. Re-establish approved access and content
metadata; never promote private prefixes to public access. Reconcile SQL/reference snapshot timing separately.
The restore action and any provider access are **not implemented or authorized as a test by this stage**.
