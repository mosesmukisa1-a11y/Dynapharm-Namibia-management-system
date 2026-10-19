# Controlled security release — non-executing owner runbook

**Current state: BLOCKED - DO NOT PUBLISH.** This is preparation, not an execution
authorization, deployment command, scheduler hook or request to change production.
Current gate: `generated-artifacts/release-offline-readiness/report.md`.

## Evidence and source discipline

- Pin an installable archive and complete manifest only after candidate work is stable.
  Source-text inventories do not prove packaging, build outputs, clean installation or
  a deployed artifact. Never substitute a Git commit or workspace URL for a provider artifact hash.
- Revalidate changed-source evidence. Unchanged API/worker source, dependency hashes or
  scanner locations justify limited historical support, not a fresh whole-candidate PASS.
- Preserve B5's existing owner-attested acknowledgement closure. Do not resend, poll
  Resend, start escalation timers or claim the synthetic escalation was delivered.
- Preserve additive schema/audits and historical stock/accounting/client identities.
  No startup schema sync, unrelated migrations, repairs or compensation writes.
- No credentials, connection strings, private hostnames, session cookies, raw errors,
  object names or business rows in artifacts. Use private owner evidence references.

## Conditional future sequence and mandatory pause points

1. **Information only:** owner submits the prepared support request for the selected
   Production Database. Receive non-secret source/replica, routing, version, trust and
   two-connection capability evidence. No provisioning or reset is requested.
2. **Exact first response action — offline:** compare that attestation with independent
   owner-selected production resource evidence. Review template completeness/expiry.
   Do not connect, copy secrets or run a backup. A complete response only permits
   preparing the next reviewed plan, not performing it.
3. **Candidate-only implementation review:** prepare independent target binding and
   same-server cancellation verification using the actual supported provider mechanism.
   Keep the current literal production refusal until a fully reviewed implementation
   exists. Review two-same-principal-connection capacity; the old one-connection
   role plan is not executable for this adapter. Never change PUBLIC or bypass RLS
   to make backup succeed.
4. **Prepare native encrypted restore compatibility:** the current synthetic JSON
   rehearsal is not an encrypted native PostgreSQL restore adapter. The eventual
   target-bound implementation must stream authenticated decryption without plaintext
   staging, reject incomplete/tampered/version-mismatched sets, bound native tools,
   verify full archive decode/completeness and restore only into positively owned
   disposable resources. It must isolate outbound network, production secrets,
   side effects, extensions/functions and role/ACL mappings. Define cleanup/retention
   ownership and failure handling first. Native database verification requires a
   new explicit isolated-database authorization; none is authorized by this runbook.
5. **PAUSE — owner approval before protected binding/configuration/role creation.**
   Confirm exact target, operator, expiry, approved configuration delta and rollback.
   No raw credential transport through chat, files, shell arguments or reports.
   Do not copy the development DATABASE_URL. Validate tools/source/version/TLS,
   independently bound identity, physical recovery/read-only guards, effective
   privileges and cancellation capability only within a new bounded read-only scope.
6. **Close B1/B4 metadata:** obtain fresh exact-target schema/auth/runtime/ACL evidence
   and actual deployed/fallback artifact hashes, service/replica/timezone/job ownership,
   effective safety booleans and manual operator acceptance. A portal render or
   successful provider build does not establish these. Read-only inspection still
   requires separately scoped authority; no business rows or broad catalog discovery.
7. **PAUSE — separate approval before storage-manifest reads or backup execution.**
   Cover database, both observed App Storage areas and all actually referenced
   private prefixes without unrestricted listing. Seven legacy and four unclassified
   references remain unresolved historical counts, not verified files or unique objects.
   Freeze an independently authorized manifest and source identities; no rewrite,
   deletion or migration of historical references. Preserve encryption, exact versions,
   checksums, KMS and immutable >=30-day Governance retention. No delete/bypass or
   retention reduction. A shared set ID does not prove cross-resource atomicity.
8. **PAUSE — separate approval before isolated restore/resource creation/cleanup.**
   Validate backup completion markers last, native restore compatibility and required
   object coverage. Measure real source recoverable age/data loss <=15 minutes and
   end-to-end restoration plus validation <=60 minutes. A fast synthetic run or a
   new dump alone does not establish recoverability of the last 15 minutes.
   Delete only explicitly owned disposable resources in the approved cleanup plan;
   retained vault backups cannot be promised deleted before Object Lock expiry.
9. **Close B2 fallback readiness:** select the exact independently known healthy whole
   artifact and SHA-256; prove strict startup, SQL boundary and credential protection
   parity, source/schema/runtime compatibility and endpoint-specific non-mutating
   smoke allowlist. Do not combine an older bridge with newer descriptor callers.
   Database restore is not the default code rollback.
10. **PAUSE — separately authorized incident containment for B3.** Confirm exact
    affected IDs, owner/role/branch, credential reuse disposition and private delivery.
    Review the existing password/session runbook. Each configuration gate change,
    reset issuance/completion, permanent replacement and session invalidation has an
    explicit owner pause point; database/provider/signing secrets need separate plans.
    Prove affected old credentials/sessions fail, fresh private login works and
    unrelated sessions survive; close execution gates afterward. Do not restore
    exposed credentials, old signing keys or invalidated sessions during recovery.
    If containment depends on code not yet deployed, stop for a separately reviewed
    restricted-maintenance plan; do not invent evidence or resume normal access.
11. **Final exact-candidate gate:** rebuild/hash archive and manifest after all source
    changes; run fresh clean installation, build, full isolated database, credential,
    startup and authenticated rehearsal under explicit test authority. Complete fresh
    security/source/log reviews, adjudicate all applicable critical/high findings,
    verify all fixture cleanup and independently approve the whole fallback. Existing
    old candidate evidence does not satisfy this gate.
12. **PAUSE — explicit owner approval before any migration, deployment or restart.**
    All B1–B4/C1 checks must be closed by actual evidence. Apply only separately
    reviewed necessary additive setup using the approved principal/time window.
    No broad migrations/startup sync and no task activation. Publish only through
    the owner-operated supported publishing flow after approval; this runbook
    performs none of those actions.
13. Post-change checks require their own approved non-mutating endpoint/session
    allowlist. Record release version/time, provider artifact evidence and bounded
    results. **PAUSE before rollback/restore/restart** on a failure, using only the
    verified whole fallback and approved target. Do not replay transactions or
    reverse historical stock/accounting as an application rollback.

No workers/schedulers are to be enabled by this release. Retiring/altering an existing
owner or job is also a production change requiring separate authority and a pause point.
