# Synthetic-only restore rehearsal

This is an offline preparation exercise, not a production restore tool.
It never accepts an endpoint, credentials, storage bucket, provider adapter or caller-chosen destination.
It reads only three checked-in schemas; fixture artifacts are generated deterministically in memory.
The CLI ignores environment configuration entirely and rejects every backup operational flag.

## Commands

From the repository root, with Node 20:

```sh
# Validation-only (default): no destination is created.
env -i PATH="$PATH" node scripts/synthetic-restore-rehearsal.mjs

# Only memory-backed synthetic restore; always verifies teardown before exit.
env -i PATH="$PATH" node scripts/synthetic-restore-rehearsal.mjs \
  --run-synthetic-rehearsal --acknowledge-disposable-cleanup

# Offline regression suite, including retained backup gates.
env -i PATH="$PATH" NODE_ENV=test node --test \
  scripts/backup-job.test.mjs scripts/backup-object-manifest.test.mjs \
  scripts/synthetic-restore-rehearsal.test.mjs
```

No scheduler, deployment hook, service restart or operational backup invocation is added.
Both synthetic-run flags are necessary. There is no production mode.
The programmatic interface rejects unrecognized fields, including destination, env and adapter.
A unique `synthetic-disposable-<UUIDv4>` memory namespace is generated internally, never accepted from input.
The required cleanup plan is fixed to destroying this memory namespace and verifying it empty.

## Fixture and admission boundary

`makeSyntheticFixture()` generates eight byte artifacts with deterministic timestamps,
sizes, SHA-256 hashes and synthetic version identities: a synthetic database archive, three objects,
authorized object manifest, version-2 backup manifest, checksum list and completion marker.
The envelope identifies the set as synthetic; the bucket identity is `synthetic-never-contact`.
No bucket is contacted. The three objects exercise all six approved source columns across
`public/uploads`, `staff-documents` and `client-history-private`.

An additional database-only projection satisfies the existing version-1 database-manifest schema.
Both manifest schemas and the authorized-input schema are checked directly using their current
checked-in documents. The offline validator supports only their explicit vocabulary and rejects
unknown keywords encountered during validation; it is not a general-purpose replacement for JSON Schema tooling.

The database payload is `SYNTHETIC_ARCHIVE_V1_NOT_POSTGRES`, a JSON model with two invented rows.
Schema-required successful dump/decode flags are synthetic fixture values, NOT evidence that PostgreSQL
tools ran. The rehearsal validates this model's structure and exact content, not a native PostgreSQL archive.
It does not invoke archive tools, database engines or executable SQL.

Before creating any destination, admission checks all byte counts/hashes, synthetic versions, complete
membership, duplicate/path safety, input schema, authorization validity and source pins, manifest links
and completion/checksum semantics. Finally the entire set must equal the generated fixture exactly.
Rehashing arbitrary substituted content cannot grant admission.

Authorization uses the explicit synthetic clock **2026-10-18T10:00:00.000Z**, not operational wall time.
Expiration tests advance this clock to the exact deadline; this is not live authorization.
The local elapsed timer measures only Node/in-memory work. It excludes real archive restoration,
downloads, uploads, credentials, provisioning, PostgreSQL recovery and application validation.

## Restore and cleanup semantics

All artifacts are prevalidated before memory allocation. Restore the model database, then ordered objects;
verify restored bytes/counts/content, then create the local restore-completion marker last.
The existing backup completion marker is verified before restoration, not recreated as proof of a new backup.
Missing/partial/corrupt sets never create a destination.

Failures at database restore, the second object or completion leave no restore-success marker.
Teardown always clears local synthetic state and verifies zero remaining entries.
Injected primary-cleanup/verification failures are reported as FAIL even when emergency memory teardown succeeds.
This local deletion is NOT permission to delete backup objects or bypass/reduce 30-day Governance retention.

## Limits

No live source, object, business row, filesystem upload, secret or provider was inspected.
Object content identity and fake destination versions test logic only; they prove neither provider
version retrieval nor IAM/KMS/retention behavior. There is no cross-resource atomicity or full coverage claim.
Seven legacy filesystem and four unclassified references remain unresolved recovery items.
Native PostgreSQL archive validation, actual isolated provider restore, recovery-point selection,
production fallback and operational RPO/RTO still need separately authorized evidence.
**B2 remains OPEN. The 15-minute RPO and 60-minute RTO remain UNPROVEN.**
