# Controlled security release — Replit-native recovery runbook

**BLOCKED - DO NOT PUBLISH.** Preparation only; no execution authority.
Current review: `generated-artifacts/replit-native-recovery-review/report.md`.

## Selected recovery path and unchanged safety requirements

The owner reports Replit Support confirmed on 2026-10-19 that direct provider
recovery access is unavailable through support. Use the existing workspace's
Production Database Settings > Point-in-Time Recovery and scheduled backups.
The old provider request and null reply template are historical, not prerequisites.
Do not create a backup login, copy a development URL or obtain a primary connection
to work around this limitation.

This is a different recovery mechanism, not a relaxation of the custom pg_dump
adapter. Its literal SOURCE_BINDING_UNVERIFIED refusal, physical-recovery,
read-only, TLS, two-connection cancellation, ciphertext and retention requirements
remain unchanged. Do not enable it. An operational custom encrypted restore adapter
and two same-principal replica connections are no longer prerequisites for the
native path. They remain necessary if that custom path is ever reconsidered.

Native PITR availability is not proof of this production target's recoverability.
Retain the <=15-minute RPO and <=60-minute restoration-and-validation RTO objectives,
complete database AND required uploaded-file recovery, safe fallback artifact,
credential containment and all B1/B3/B4/C1 gates. No silent risk waiver.
Documented daily scheduled backups alone cannot meet a 15-minute RPO.
App Storage is not covered by database PITR or a development checkpoint.

## Owner-observed settings baseline

On **2026-10-19 Africa/Windhoek** (time not provided), the owner observed **Active
production database**, PITR **On**, recovery window **7 Days**, and only the
**“Restore database…”** action. Latest recoverable time and isolated destination
were not displayed without entering that flow; it was not entered.
Scheduled backups were **Off**, with **“Automatic daily backups are off”** and
**“No backups yet.”** No settings/actions were changed.
Evidence: `generated-artifacts/replit-native-recovery-review/owner-ui-observation.json`.
This is owner testimony, not an independent Agent UI or provider verification.

PITR configuration is now evidenced; its actual recovery point and safe isolated
rehearsal remain unknown. No scheduled backup is evidenced as available. Do not
interpret that as PITR Off, and do not turn backups on under this runbook.

## Shortest safe sequence, with explicit pause points

1. **Settings inspection completed to the displayed limit.** Preserve the baseline
   above; do not repeatedly request facts already supplied. Next prepare a
   **separately authorized non-committing restore-flow inspection**, with explicit
   target, no confirmation/submission, no settings change and stop conditions.
   First establish that opening the flow is non-mutating; if that cannot be
   established, stop for information-only clarification of the self-service UI.
   Do not open the flow under the current offline-only instruction.
   Obtain actual latest recoverable timestamp/timezone, earliest available point,
   isolated destination support and final commit boundary without performing
   Restore. Record exact observation time only when supplied, never infer it.
   No enabling backups/retention changes; those require a separate decision.
2. **Read-only target/fallback inventory:** privately associate the selected
   production database and deployment; record provider-supported release/build
   identifiers with exact candidate/source artifact SHA-256 associations. A
   successful build, Git hash or workspace checkpoint alone is insufficient.
   Identify the healthy whole fallback and verify strict startup, SQL-boundary,
   credential protection, schema compatibility and non-mutating smoke allowlist.
   If the UI cannot expose an artifact hash, require a trustworthy build-to-artifact
   attestation; do not fabricate it. Keep the gate open if neither is available.
3. **Prepare the native rehearsal plan after permitted inspection:** verify whether the recovery UI
   offers an isolated destination/export suitable for rehearsal. Current public
   documentation describes destructive replacement of the selected database,
   not a proven clone workflow. Never test Restore on the live target.
   If only in-place production restore is available, STOP: B2 remains blocked
   until a supported isolated path is established or the owner explicitly revisits
   the recovery requirement in a separate decision. A synthetic development
   checkpoint cannot substitute for production restore evidence.
4. **Prepare complete recovery coverage:** retain the observed single App Storage
   bucket and `public`/`staff-documents` areas as historical evidence. Include
   source-defined private prefixes, seven legacy filesystem and four unclassified
   reference counts; these are not proven unique objects. Preserve `/uploads`.
   Native SQL backups do not recover object bytes, upload directories, secrets,
   application code, custom domains or deployment/job settings. Establish their
   independent recoverability and mappings at the intended recovery point,
   including dependencies of historical database restore points.
   **PAUSE before any reference query, object/file inspection, export, storage
   snapshot/backup or settings change:** obtain bounded owner authority, exact
   target/manifest and data-handling plan. No AWS access in this review.
   Previously approved S3 Governance >=30 days remains immutable if used later;
   native backup retention is a separate mechanism, not a replacement claim.
5. **PAUSE before creating a disposable destination or executing any restore.**
   Approve exact isolated resources, no production bindings/credentials, outbound
   isolation, role/extension/job containment, operator, expiry, validation and
   cleanup ownership. If native controls cannot meet these conditions, stop.
   Measure latest recoverable age and actual recovered-point loss <=15 minutes,
   ongoing protection/cadence, and total restoration plus database/storage/app
   validation <=60 minutes. Include object consistency and credential/session
   reappearance handling; DB restore is not automatically cross-resource atomic.
   **PAUSE before cleanup:** remove only approved disposable resources; retain
   evidence. Never delete production data or retained locked backups.
6. **Close B1/B4 with fresh metadata evidence:** exact schema/auth/ACL compatibility,
   active build/command/flags, service instances, timezone, scheduled deployments,
   in-process timers and worker ownership, manual operating acceptance.
   Read-only UI metadata can be reviewed now; new catalog/session/application
   checks require a fixed separately authorized scope. Missing env metadata
   does not prove runtime flags unset. Do not activate or retire anything.
7. **Close B3 separately:** inspect retained containment runbooks and privately
   approved affected-account inventory. **PAUSE before each password/key/reset,
   session invalidation or configuration action.** Prove old access fails and
   new authorized access works without harming unrelated sessions. Neither a
   secret's presence nor a candidate test proves production containment.
   A recovered database must not reactivate exposed credentials or invalidated
   sessions. If mitigation requires new code first, approve a restricted
   maintenance plan; do not silently waive B3 to publish.
8. **Final exact-candidate gate:** package and hash a complete archive/manifest
   after all candidate work. Under separate isolated-test authority run clean
   install, build, full database, credential, startup, browser, fixture cleanup
   and current security/source/log checks. Zero unresolved critical/high findings
   must be established against that archive, not historical changed-source reports.
   Preserve B5's existing human/policy acceptance without resend or timers.
9. **PAUSE before any necessary migration or configuration change:** explicit owner
   approval of reviewed additive delta, target, principal, window and rollback.
   No broad schema sync, data repair or historical changes.
   **PAUSE before publication/restart:** all B1–B4/C1 evidence complete, exact whole
   fallback reviewed, operator acceptance and bounded post-release checks agreed.
   Owner uses the existing Publishing controls; this document executes nothing.
10. Record actual release ID/hash/time and approved non-mutating health/portal checks.
    **PAUSE before code rollback, database restore or service restart on failure.**
    Prefer the reviewed whole code fallback for code failure; database PITR is a
    separate destructive data-loss decision, not automatic code rollback.
    Agent checkpoint rollback changes development, not the running production app;
    republishing is another separately approved action. Do not restore unsafe
    startup code, old keys/sessions, or replay historical stock transactions.

## Monitoring and settings boundaries

Publishing monitoring/logs can support uptime/build observations, not backup
completeness. Prefer sanitized aggregate/status metadata; raw runtime logs may
contain sensitive data. No new alert, scheduler, backup schedule, worker or
deployment hook is authorized. Scheduled database backups, Scheduled Deployments,
application timers and Agent checkpoints are distinct controls.

Recovery operator acceptance is still needed; alert-response ownership is not
recovery-operation ownership. Record timestamps in UTC with the original UI
timezone. Do not change timezone or timestamps to make recovery lag appear smaller.
