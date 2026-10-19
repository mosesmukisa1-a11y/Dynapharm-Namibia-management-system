# Prepared provider-support request — not sent

> **Superseded for the active release plan.** On 2026-10-19 the owner reported
> Replit Support confirmed that direct provider recovery access is unavailable
> through support and recovery must use workspace self-service controls.
> This earlier request is retained as historical design evidence, not a pending
> submission or release prerequisite. Do not resend it. See
> `docs/security-controlled-release-runbook.md` and
> `generated-artifacts/replit-native-recovery-review/report.md`.
> The custom adapter and its two-same-principal monitor guards remain unchanged
> and disabled; they do not apply to the separately reviewed native PITR path.

**Information-only request. No provisioning, credential reset, role/grant changes,
production query, restart, failover, migration, export, backup or deployment is authorized.**

The owner should open https://replit.com/support from the owning workspace and select the
existing application/Production Database privately. Do not paste connection strings, hostnames,
passwords, database identities, certificates, business data or secret screenshots into the request.
Provide only the non-secret project/deployment/database resource references through the support UI.

**Submission status: PREPARED, NOT SENT.** This review does not access the account or submit
a ticket. The owner must select the existing project and Production Database in the support
UI; no current resource ID or production host is guessed from workspace metadata.

## Exact request

Subject: Confirm a supported direct production recovery-replica source for guarded logical backup

We need an independently verifiable, provider-supported read-only/recovery source for a bounded
pg_dump of our existing Replit Production Database. This message requests capability and
non-secret architecture evidence only; please make no changes.

1. Confirm the actual production provider/engine/version and non-secret resource identifiers.
   Is a direct PostgreSQL connection to a physical read-only recovery replica available for this
   exact Production Database, separately from the primary and the Agent read-only SQL interface?
   Our fixed gate requires both transaction_read_only=on and pg_is_in_recovery()=true.
   A primary role with a changeable read-only default does not satisfy this gate.
2. If available, describe the supported owner-operated protected binding/linking workflow.
   Credentials must flow only into a protected runtime binding, not through Agent, chat, tickets,
   reports or source. Do not regenerate existing application credentials or redeploy the app.
3. Supply non-secret evidence linking that replica resource to the current production resource:
   an authoritative UI/API/provider attestation, observation time/expiry, replica/primary relationship,
   stable resource IDs and a privately comparable endpoint identity. A caller-supplied
   "production" label, matching database name, or inferred hostname is insufficient.
4. Confirm direct/non-pooled/session-affine routing: monitor and native dump connections must
   reach the same physical server. No transaction pooler, reader load balancer or silent failover
   may make pg_stat_activity on the monitor miss the dump session. Explain how a target change
   is detected and causes an abort.
5. Confirm TLS verify-full hostname and certificate-chain verification using a trusted readable
   system CA bundle, plus the supported network/runtime location. No no-verify workaround.
6. Confirm a least-privilege backup principal can have only required CONNECT/schema USAGE/SELECT,
   no ownership/elevated memberships/RLS bypass and full logical-dump visibility. Confirm SELECT
   on sequences and large objects, RLS/extension/foreign-data limitations, and effective PUBLIC
   routine/system-view permissions. Do not alter PUBLIC/application privileges to meet this.
7. The bounded adapter needs two simultaneous connections for the same least-privilege principal:
   one reserved monitor plus one serial pg_dump, no parallel jobs. It queries only its own
   pg_stat_activity rows and may call pg_cancel_backend only after matching the exact random
   application nonce, PID, backend_start, same actor and same database. It never terminates other
   sessions or reads SQL text/business rows. Confirm this is supported without pg_monitor,
   pg_read_all_stats, pg_signal_backend or administrator grants.
   The earlier one-connection role proposal cannot support this design; any future change to
   a two-connection login requires a revised reviewed plan and separate owner creation approval.
8. Describe replica conflict/cancellation behavior, supported pg_dump major version and
   completeness checks. Provide recovery retention and latest provider-confirmed recoverable
   timestamp as non-secret metadata if available. No restore or data access is requested.
9. If no direct recovery replica is exposed, explicitly confirm that limitation for this resource.
   Describe a provider-operated export/snapshot/recovery-copy alternative with immutable
   source identity, timestamps, completeness/checksum metadata, protected delivery and a safe
   isolated validation route. Do not execute it. Such an alternative requires a separate
   reviewed adapter/owner authorization; it is not permission to weaken the existing gate.

Please return capability/evidence references and the exact supported owner UI steps only.
No passwords, connection strings, hostnames, private keys, business rows or object listings.

Please distinguish a supported capability from a feature already configured for our resource.
Include observation time, the validity/revalidation limit of the resource attestation, engine
major version, and opaque non-secret production/replica/support reference IDs. Describe
secure credential linking and TLS hostname verification privately without returning the
credential, hostname or connection string in this response.

You may use `b2-recovery-source-reply-template.json` as the non-secret response checklist.
Its nulls mean **not established**, never false/true defaults or authority to provision.
Do not populate the repository template with operational credentials or account exports.
The offline validator deliberately cannot return execution approval or an established binding.

## Evidence required before unblocking candidate production execution

- Provider confirmation of the exact supported source type and stable resource relationship.
- Protected binding mechanism and independent target-verification evidence, without exposing credentials.
- Direct same-server routing/cancellation visibility evidence and a two-connection resource allowance.
- Verified TLS, recovery/read-only guards and role/ACL/completeness capability.
- Fresh narrowly scoped owner authorization before any future connection or provisioning.
- No implicit replacement of the recovery gate with primary-only/read-only-session evidence.

The candidate intentionally retains SOURCE_BINDING_UNVERIFIED at all production entry points
until a supported mechanism is reviewed and implemented. There is no enabling environment flag.

## Exact first action after a response

Offline only: compare the provider's production/replica relationship and opaque references
against separately supplied owner-selected Production Database resource evidence. Then
check every assertion in the response template, including **two same-principal simultaneous
connections to the same physical server**, current attestation times, verified TLS,
own-session cancellation and no elevated grants.

`reviewRecoverySourceReply` in `scripts/lib/release-evidence-review.mjs` checks completeness
only. Its output never repeats supplied references or private material and cannot verify that
a provider assertion is true. A complete reply yields INFORMATION_COMPLETE_FOR_OFFLINE_PLAN_REVIEW,
not permission to connect or a claim that the source binding exists.

If any item is missing/contradictory/expired, request only that clarification; no fallback
to the primary, workspace database, pooled reader or guessed replica is allowed.
If complete and corroborated, prepare the target-bound binding/monitor/restore implementation
and reviewed two-connection role plan. Obtain fresh narrowly scoped owner authorization
before any protected binding, provisioning, database connection or operational execution.

## Public documentation reviewed (2026-10-19; no account/production inspection)

- https://docs.replit.com/features/data-and-storage/connection-details:
  production PostgreSQL-compatible external clients use Production Database Settings.
- https://docs.replit.com/features/data-and-storage/development-and-production:
  editor and published databases differ; direct vs pooled connections are discussed;
  development infrastructure is not proof of this production backend.
- https://docs.replit.com/features/data-and-storage/sql-database:
  production Monitoring/Settings tools are documented.

These pages do **not** establish a directly available recovery-replica credential or target
for this project. Absence of documentation is not proof that Replit cannot provide one.
The initial targeted documentation search returned no relevant replica-specific answer;
the primary pages above were fetched and reviewed directly.
