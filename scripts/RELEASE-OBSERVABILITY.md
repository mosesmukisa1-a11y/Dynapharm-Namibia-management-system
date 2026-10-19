# Release identity and post-publication verification

No production action is authorized by these instructions. Publication, live
verification, recovery and any configuration change require their own approval.

## What the endpoint proves

GET /api/release-status is public, read-only and no-store. The JSON contains
exactly buildDigest, schemaContractDigest, startupMode, schedulerState,
workerState and readiness. Invalid/unpackaged identity returns an empty 503.
No request triggers SQL, storage, session access, scheduling or worker activation.

The digest names the approved **source archive**, not a platform/container image.
schemaContractDigest hashes api/services/startupSchema.js, the minimum startup
contract, not production schema contents or historical data. Readiness reports
the existing in-process compatibility result, not a fresh database health probe.

Scheduler state is this web instance's effective startup policy. Worker state
is disabled because this entrypoint never starts the separately owned worker.
This endpoint cannot attest other services' worker ownership or global job absence.
Legacy mode reports not-ready unless compatibility has actually been established.

## Detached identity — avoiding a self-referential archive

An archive cannot contain its own exact SHA-256 without changing that hash.
The clean packaging runner freezes source, hashes the tar, then generates a
detached release-binding.json using that hash and the source manifest. Neither
the binding nor the derived .release-identity.json belongs inside the source tar.
Record and approve both archive and manifest digests.

The existing Vite production-build command now has a build-only plugin which
requires .release-binding.json and verifies every recorded source hash, path and
minimum schema-contract digest before writing a read-only identity file. There
is no environment-variable fallback for the build identity. Missing, changed
or malformed binding fails the build. Production and strict web startup fail
before listening when the derived identity is missing/malformed. Runtime loads
and freezes it once. It never reads an environment digest on each request.

The clean-install runner creates the binding from the independently verified tar
inside its disposable copy. It does not copy workspace generated state.

For a later **separately approved** release, unpack the reviewed archive into a
clean release workspace and use:

```sh
node scripts/stage-release-binding.mjs ARCHIVE MANIFEST TARGET APPROVED_ARCHIVE_SHA256 APPROVED_MANIFEST_SHA256
npm ci
npm run build
```

Staging verifies the approved manifest checksum, archive checksum and extracted
source hashes. It only writes derived release files locally. The matching
binding and generated identity must be present in the eventual deployed build;
they are never served as static files. Git ignores these derived files.
If the publishing transport omits them, build/startup fails closed. Whether that
transport includes the files is a future publishing proof, not established here.
Do not silently regenerate a manifest from unreviewed live/workspace files.

The detached binding is an integrity record, not a digital signature or trusted
platform attestation. Protect the reviewed release inputs. A compromised server
could lie; this endpoint does not replace independent deployment/control-plane
or credential-containment evidence.

## Future verifier (NOT run against production in this task)

```sh
node scripts/verify-release-status.mjs HTTPS_ORIGIN APPROVED_ARCHIVE_SHA256 APPROVED_SCHEMA_CONTRACT_SHA256
```

Exactly one GET; no credentials/cookies, redirects or writes. A five-second total
deadline covers fetching and body reading; response is capped at 1024 bytes.
Only PASS or a finite sanitized failure code is printed. Approval requires exact
build/schema digests, code-only startup, both ownership states disabled and ready.
No raw response, URL, hostname or error details are printed.

B2 recovery and all live-proof blockers remain open until separately authorized
evidence closes them. A successful local rehearsal does not authorize publishing.
