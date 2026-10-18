# B2 candidate-only manual backup job

## Current authority and scope

This job is **not activated**. This change authorizes only code and local/offline tests.
No scheduler, application import, deployment hook, configuration mutation or new dependency is added.
Existing `.replit` changes, including any persisted awscli2 setting, are unrelated and must be left untouched.

The implemented future execution path is a **single PostgreSQL database logical backup to an existing protected S3 bucket**.
It does not capture Replit App Storage, seven legacy or four unclassified references, cluster-global roles,
configuration/keys or a cross-resource recovery watermark. It cannot close B2 or establish RPO/RTO.
All 49 general App Storage references and 19 staff-document references still require the separately authorized
whole-bucket/reference recovery work in `generated-artifacts/b2-storage-recovery-plan/report.md`.
The existing `/uploads` route and historical references are unchanged.

## Default: validation only, zero calls

Run `node scripts/backup-job.mjs` or append `--dry-run`.
The job checks configuration syntax and required field presence **in memory only**.
It does not load the I/O adapter, inspect files, spawn tools, query a database or contact a provider/storage API.
Tool availability is explicitly `NOT_PROBED`; no version command runs in this mode.
Logs/results are allowlisted JSON; values, raw arguments, URLs, bucket names, private paths, stderr and stacks are not printed.
Exit codes: 0 valid dry-run or completed backup; 2 incomplete/invalid dry-run configuration; 1 blocked/failed execution.

Configured AWS secrets or environment variables claiming approval do not enable execution.
No `DATABASE_URL` fallback exists. Do not paste credentials or connection strings into chat/commands.

## Future owner-operated execution gates — NOT AUTHORIZED NOW

Both flags must be supplied explicitly:
- `--execute-owner-approved`
- `--acknowledge-backup-writes-and-30-day-retention`

One flag alone, conflicting/unknown flags or attempting retention bypass is rejected before I/O.
The adapter independently requires both flags. These gates are not a substitute for target-specific owner authority.
Do not run the two-flag invocation as part of this change or to discover its effect.

Required privately provisioned configuration names (no values in evidence):
- `B2_BACKUP_DATABASE_URL`: dedicated PostgreSQL source; never the ambient application connection.
- `B2_BACKUP_SOURCE_CLASS`: `production` or `isolated`.
- `B2_BACKUP_PG_ROOT_CERT`: readable trusted CA path for production; production URL must request `sslmode=verify-full`.
- `B2_BACKUP_OUTPUT_DIR`: existing absolute canonical, non-symlink directory, owned by the operator with mode 0700,
  on a separately verified encrypted volume; never an uploads directory. Do not use the application checkout.
- `B2_BACKUP_ENCRYPTED_OUTPUT_CONFIRMED=true`: operator assertion, not an encryption attestation by this job.
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

After both gates, execution checks matching-major `pg_dump`/`pg_restore` and AWS CLI v2 with required
conditional-write/checksum/retention capabilities. Use trusted, owner-reviewed executable paths.
The child environment drops ambient AWS endpoints/profiles/metadata credential discovery, PG services/options
and preload settings. Credentials are supplied privately by environment, not connection-string command arguments.
Subprocess stderr is drained without logging or retaining it; failures have fixed safe categories.

## Artifact, manifest and completeness protocol

- UTC local directory: `<protected-root>/YYYYMMDDTHHMMSSmmmZ_<uuid-v4>/`.
- S3 prefix: `b2/database/YYYY/MM/DD/YYYYMMDDTHHMMSSmmmZ_<uuid-v4>/`.
- A new 0700 run directory and 0600 `database.partial` are exclusively created.
- `pg_dump` uses custom format, no interactive password, a read-only transaction default, bounded timeouts
  and no include/exclude filters. A nonzero exit never proceeds to artifact upload.
- Require a custom-archive header; `pg_restore --list` and a **full archive decode to `/dev/null` without
  database credentials or a database destination** must both pass. Table-of-contents validation alone is insufficient.
  Rename to `database.dump` only after these checks.
- Reject zero-byte, nonregular, symlinked, multiply linked, changing or >5,000,000,000-byte artifacts.
  This single-PutObject implementation intentionally does not support larger/multipart backups.
- Compute SHA-256 by streaming locally, recheck immediately before upload, use S3 full-object SHA-256 validation,
  conditional create (`If-None-Match: *`), KMS encryption and explicit retention.
- Verify the exact returned object version with HeadObject: size, checksum, version, KMS key and retention.
- Write/upload in order: `database.dump`, `manifest.json`, `SHA256SUMS`, `COMPLETED.json`.
  Completion is last and links manifest/checksum-file hashes. No final success before every verification passes.
- Manifest schema: `docs/schemas/b2-backup-manifest.schema.json`.
  Manifests/version identifiers/dump checksums are protected recovery material, not public evidence.
  Public logs contain only event/time/mode/stage/status/fixed error codes.
- The owner must retain protected run material after failure; there is no automatic deletion or failed-upload cleanup.
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
   Privately download only the authorized versions into a 0700 encrypted staging area; retain backup versions untouched.
3. Require completion marker, verify its manifest and checksum-file hashes, validate the manifest schema,
   then verify every `SHA256SUMS` entry against the downloaded bytes. Reject missing, partial or inconsistent runs.
   The restore verifier must restrict entries to fixed expected basenames, not execute arbitrary manifest paths.
4. Re-run full archive decode locally, then restore into the explicitly owned isolated database using reviewed
   restore roles/options and isolated credentials. Do not rebind production, run historical repair or restore revoked
   production sessions as active test access. Restore required globals/config separately only if expressly authorized.
5. Restore the separately protected App Storage/legacy data into isolated storage and validate the common DB/object
   recovery point and access policy. This job has no object backup: **a database-only restore is not complete B2 recovery**.
6. Use synthetic staff tests and private aggregate/integrity validators, strict startup, no seeds/migrations/jobs.
   Stop the RTO clock after all required validation. Record RPO <=15 minutes and RTO <=60 minutes only with complete
   provider-confirmed cross-resource evidence; this job's dump times do not establish either objective.
7. Clean only explicitly owned disposable resources under cleanup authority. Do not delete retained S3 versions
   or alter their retention. Protect local sensitive artifacts until authorized secure disposal.

## Local/offline test command

`node --test scripts/backup-job.test.mjs`

This follows the repository's standalone `scripts/*.test.mjs` convention; those files are deliberately outside
the application's Vitest unit project. No package/lockfile or workflow change is necessary.
