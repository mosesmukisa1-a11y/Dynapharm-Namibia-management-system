---
name: Code-only publication safety
description: Production checkpoint and startup side-effect gates required for narrowly authorized code-only releases.
---

A code-only publication must stop unless the actual healthy production source checkpoint and code-only recovery are established, and startup cannot run unauthorized migrations, seeds, backfills or stock/financial automation.

**Why:** The user explicitly requires these as pre-publication gates. A frontend-only diff and successful public health check do not establish startup safety; a runtime version marker is not a reproducible source checkpoint.

**How to apply:** Compare the reviewed candidate with current HEAD, inspect both publishing commands and application startup side effects, and distinguish existing production automation from actions performed by the release. Do not substitute a pre-repair workspace checkpoint for the deployed source. If either gate fails, save a BLOCKED report and stop; obtaining a separate approval for startup-safety changes is not permission to repair production data or disable unrelated automation.

Keep legacy bootstrap as an indivisible lazy operation; code-only must be a hard boundary, including automatic price activation on otherwise read-only HTTP requests.

**Why:** Development legacy behavior remains coupled and must retain its ordering. The user subsequently required production to reject legacy/unset startup profiles and require all safety flags explicitly false. A health request also exposed automatic price activation beyond the obvious startup functions.

**How to apply:** Preserve development legacy ordering/guards, never permit a production fallback to it, reject permissive overrides in code-only, and verify isolated HTTP startup. Workers need separate explicit task/service authority. This is not permission to disable normal staff transactions or change live settings.

An exact recovered legacy source snapshot is not automatically a zero-write-compatible production rollback target.

**Why:** Restoring source offline does not run its bootstrap; republishing it does. A snapshot predating startup controls can ignore a code-only setting and resume old mutations.

**How to apply:** Preserve the exact raw source and clearly separate any reviewed rollback candidate retaining safety controls. Never label offline restoration proof as a production no-write rollback rehearsal.

A safe release smoke allowlist is endpoint- and mode-specific. Do not equate an HTTP GET, a code-only process, or a successful portal HTML response with a non-mutating browser workflow.

**Why:** Legacy read handlers can normalize persisted identity data, and portal scripts automatically request additional endpoints. Startup guards intentionally do not disable normal staff business transactions.

**How to apply:** Audit shared authentication/providers and page-initiated requests; exclude write-capable and unresolved reads. Label HTTP shell/API checks separately from rendered authenticated browser evidence, and do not expand a reviewed smoke allowlist implicitly.

Owner approval packages do not themselves authorize production inspection. Human acceptance of disabled-job manual procedures and monitored alert acknowledgement cannot be supplied by the agent.

**Why:** The owner explicitly separates operational acceptance, narrowly scoped production read-only inspection, and later mutation/publication authority. Sending an instruction attachment is not any of those approvals.

**How to apply:** Prepare the allowlist first; require explicit scoped read-only approval. Inspect only approved metadata/health, never unrestricted business rows or credentials. This approval still excludes migration, service retirement/restart, configuration changes, worker activation, repairs and publication. Record genuine supplied acceptance without treating it as evidence of alert delivery or actual target worker state.

Upload fail-closed hardening does not authorize retiring legacy file serving or rewriting historical references.

**Why:** The owner requires existing upload references and files to remain intact while legacy and unclassified storage recovery dependencies are unresolved.

**How to apply:** Keep historical serving separate from the new-upload write policy. Require a separately authorized recovery/reference review before route retirement, file deletion, migration or historical URL replacement. Include confidential staff documents alongside general uploads in recovery scope. Check retained database restore points too: current zero legacy references alone does not prove a restored database will no longer need the old serving route.

The owner accepts temporary manual operation while automated jobs remain off, limits
manual scheduled prices to global existing-product schedules, and requires a
maximum 15-minute RPO and one-hour RTO before controlled release planning.

**Why:** The owner explicitly separates manual operating acceptance, alert delivery,
time-limited production metadata inspection, and later mutation/release authority.
Backup availability alone does not prove measured recovery objectives.

**How to apply:** Consult the current operational authorization for its expiry and
targets before each resumed production inspection; never renew it implicitly.
Hold unsupported branch/staged schedules. Require existing independent recovery
evidence; label its absence as a failed recovery evidence gate, not proof that
backups do not exist. Keep names, email addresses and other personal approval
details out of agent memory.

Treat the owner-selected 30-day S3 Object Lock Governance retention as operationally immutable.

**Why:** Governance mode can technically be bypassed by sufficiently privileged principals, but the owner explicitly forbids treating that capability as test cleanup permission.

**How to apply:** Never promise deletion before actual retention expiry, including partial backup runs or future authorized test objects. Distinguish Governance from Compliance and separately verify no-bypass operating permissions; backup code approval is not provider execution authority.

An authorized backup object manifest does not grant discovery/listing or business-row query authority.

**Why:** The owner separates reference export/read authorization from backup execution; database and object captures may also occur at different times.

**How to apply:** Consume only the separately supplied bounded manifest. Do not infer live coverage, provider snapshots or cross-resource atomicity from matching content hashes, source fingerprints or a shared backup-set ID.

Treat authorized synthetic restore rehearsals as preparation, not operational recovery evidence.

**Why:** The owner permits generated synthetic artifacts and memory/local disposable fakes in this stage, explicitly excluding native backup/database tools and live provider access.

**How to apply:** Label measured timings NON-PRODUCTION, keep B2 open and production RPO/RTO unproven, and require separate authority before a native archive or provider restore.

Owner-approved backup hardening uses one aliased customer-managed KMS key with rotation, vault-only SSE-KMS, and narrowly scoped operator permissions.

**Why:** The owner separates persistent configuration authority from backup execution and requires no duplicate key creation, no deletion/Governance bypass, and no invented encryption or effective-policy attestations.

**How to apply:** Verify the exact target and operator first, reuse the approved alias rather than creating another key, keep key ARNs protected, and set assurance flags only after verification. Use the owner's approved exact in-memory STS identity comparison rather than requiring IAM GetUser; retain no raw identity response. Stop on a failed phase; configuration approval alone does not authorize backup, restore, restart or publication.

Destination SSE-KMS and a private local directory do not establish encrypted local backup staging.

**Why:** The owner conditions the staging assurance on verification; cloud object encryption does not protect a plaintext local dump, and a protected production-source copy must not silently use a development URL.

**How to apply:** Never invent a volume-encryption attestation. The owner subsequently approved ciphertext-only application staging as the alternative: source plaintext must never be staged, and that assurance must not be described as filesystem encryption. The owner also permits direct use of the already injected protected database URL instead of a duplicate secret. Keep verified TLS and execution-time identity/read-only checks; a candidate validation does not establish the production target or native restore compatibility.

Backup-only PostgreSQL role defaults must not be presented as immutable read-only enforcement.

**Why:** An ordinary login can change read-only/time-out defaults, and native dump clients can clear server timeouts after startup. PostgreSQL has no per-role DENY overriding PUBLIC grants; PUBLIC system-view updates and built-in large-object creation can exceed SELECT-only intent. A no-bypass role can be unable to dump RLS-protected rows completely. A custom login alone does not provide a recovery-replica binding.

**How to apply:** Require independent provider capability/target evidence, least-privilege effective ACL checks and the existing recovery guard. Treat TLS/connect timeout as client controls; fail closed if server-query bounds cannot survive the native tool's own settings. A client watchdog is not server cancellation proof. Block unrelated PUBLIC/RLS changes, and do not infer custom-role support or prohibition from the managed Agent interface being read-only.

Read-only catalog guard SQL needs native isolated execution, not only static SELECT checks.

**Why:** PostgreSQL can reorder WHERE predicates and evaluate relation-type-specific privilege functions on incompatible objects. Prepared SQL can also name privilege helpers absent from the actual server version.

**How to apply:** Use evaluation-safe type guards and supported catalog ACL semantics; include negative controls for PUBLIC, inherited and column-level grants. Keep synthetic primary/no-TLS evidence distinct from production recovery/TLS gates; never weaken those gates to make a local rehearsal pass.
