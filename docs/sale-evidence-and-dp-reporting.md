# Sale evidence, DP reporting, Namibia dates and operator repair

## Values and compatibility

Commercial DP is the distributor price captured when stock is sold, not the
supplier/received DPC cost. The received CIF/DPC fields and physical deductions
keep their original meaning. Sale quantities remain positive magnitudes in
storage; ledgers show their signed outflow separately.

The canonical sale record is a completed walk-in/member/campaign header, or an
individual prescription dispensing session. One uniquely source-keyed
`sale_created` event is written in the same request transaction as its stock,
allocations, mirrors, receipt and required activity. Prescription source keys
identify a session rather than grouping separate partial issues by report/time.
Authenticated actors, not submitted cashier names, identify the posting staff.
Use an `Idempotency-Key` header or stable `requestId` for campaign/dispense
network retries; walk-in offline IDs also remain supported. Reusing a retry key
with different contents is rejected. Successful replay returns the saved response.

New movement metadata contains commercial DP, allocated customer charge, margin,
original reference/receipt and business date. Snapshot `financial_dp_unit` is
commercial DP; snapshot `unit_cost`/`unit_dp` are original received cost/DPC.
A zero is evidence. A missing DP is incomplete, not zero, CP or today's price.
Customer cash totals are labelled separately. Header-only/unallocated fees are
not evidence of product DP. Allocated batch revenue sums to the captured receipt
once, using recorded line weights (or quantity for one exactly linked product).
No new consultation fee, discount or entitlement policy is introduced.

Windhoek business days use Africa/Windhoek midnight, inclusive start and exclusive
next-day start, so fractional seconds at day end are included. Transaction
instants stay UTC/timestamptz. Display uses Africa/Windhoek, independent of the
browser timezone. Expiry/calendar strings remain date-only.

Only actual branch-scoped requests in pending, reviewed, approved,
partially_dispatched, dispatched or in_transit count as open. The prior nightly
depletion-based request generator is disabled: low-stock alerts still run and
staff can submit requests explicitly. This does not prove that a reported
historical request increase was directly written by a sale.

## Metadata-only historical repair

Nothing runs this repair automatically, including startup, migration or deployment.
Start with an exact receipt/reference (the supplied reference is supported):

```sh
node scripts/repair-sale-evidence.mjs --reference TU-2026-000122
node scripts/repair-sale-evidence.mjs --reference WALK-1791966024927-UDFO
# Or a branch and at most 31 inclusive Windhoek days:
node scripts/repair-sale-evidence.mjs --branch townshop --from 2026-10-01 --to 2026-10-14
```

The default is read-only. Review the restricted JSON report under
`generated-artifacts/sale-repair/`. It contains eligible patches, unresolved
sources, a plan hash and a fingerprint of the exact source rows. Nonexistent
references are explicitly reported. No current price lookup, name/time proximity
join, surviving-stock inference, reconstructed supplier cost, stock replay or
quantity correction is allowed. Multiple source lines must conserve exact
product quantities; ambiguous prices and missing charged allocations require
review. Old prescription movements without an exact completion identity and
uncaptured branch-mirror identities are explicitly unresolved.

The dry run also reports a database fingerprint and SELECT-only schema readiness
checks for the audit source-key column and its valid, unconditional unique index.
Missing schema blocks apply; the tool never repairs schema itself. The source
fingerprint includes exactly captured branch mirrors, and their branch, original
reference, product, batch, movement type and quantity must agree before a mirror
patch is eligible. Mirror-only and allocation-only missing metadata are included
even when central movement metadata is already complete. A reference-linked
mirror without an originally captured mirror ID remains unresolved.

After operator review and a genuine database backup, apply to the same database:

```sh
node scripts/repair-sale-evidence.mjs --reference TU-2026-000122 \
  --apply --approve REVIEWED_PLAN_HASH --fingerprint REVIEWED_FINGERPRINT \
   --database-fingerprint REVIEWED_DATABASE_FINGERPRINT \
  --backup /secure/path/to/reviewed-backup-file --backup-verified
```

The tool checks that the backup file exists and is nonempty; the operator must
verify that it is a restorable backup of the correct database.
`--backup-verified` is the operator's explicit acknowledgement of this verification,
not an automated restore test or permission supplied by the agent. Retain the
backup's verification record separately. Stale plans and different database
targets fail. Any dry run from the older planner must be repeated and reviewed
because the strengthened plan/fingerprint now include mirror and target evidence.
The CLI requires separate approval of the database fingerprint and reports
`readiness.isPrimary`; apply rejects a recovery replica or a plan without
confirmed primary status. This recovery check does not establish that a writable
database is the intended production target: the operator must independently
confirm the correct target. Replica-derived review hashes are never approval values.
Apply runs serializably, fills only missing movement/mirror/allocation metadata,
preserves nonblank evidence including zero, and inserts reconstructed-provenance
audit events with original actors/timestamps when available. It returns before
and after plans plus an invariant check of stock quantities, receipt values and
non-metadata branch mirror values. The apply report retains the approved hashes,
database fingerprint and operator backup-verification acknowledgement.
Rerunning an unchanged repaired scope is idempotent. Review unresolved rows
separately; do not treat an incomplete repair as stock-loss evidence.

## Verification and limits

The isolated regression runner creates and drops a separate empty database:

```sh
node scripts/run-isolated-stock-audit.mjs tests/sale-evidence.spec.js \
 tests/stock-lifecycle-end-to-end.spec.js tests/stock-safety-atomic.spec.js \
 tests/stock-cost-lifecycle.spec.js tests/cross-portal-reconciliation.spec.js \
 tests/linked-reversals.spec.js
npm run build
```

The sale suite uses real login cookies and real HTTP handlers, not mocked
successful transactions. Browser fixtures use a separate disposable UI harness:
`node scripts/run-isolated-stock-ui.mjs --empty`, then
`node scripts/seed-sale-evidence-ui.mjs`. This seeds synthetic stock and a sale
only into that owned isolated database, with saved DP 341, charged 443, margin
102, later catalogue DP 999, and six real open requests.

These isolated checks alone do not verify historical production records.
The bounded read-only production reviews are documented below. No production
sale replay, quantity repair or historical apply has been performed.

### Bounded production review — 14 October 2026

After the operator confirmed the repair was merged and authorized the
exact-reference read-only review, production was inspected through the read-only
replica. This was not a CLI dry run against the primary database and does not
authorize an apply.

- `TU-2026-000122` and `WALK-1791966024927-UDFO` identify the same completed
  Tsumeb sale, dated 14 October 2026. The captured line and allocation show one
  D.I GROW (GREEN) (1 LITER), commercial DP N$341, customer charge N$443 and
  commercial margin N$102. These values came from original saved evidence,
  not today's catalogue.
- The exact-reference extract contained one sale, one posted central movement,
  one allocation, no sale audit events and one reference-linked branch mirror.
  The existing pure planner proposed central movement metadata and a
  reconstructed sale audit event for one eligible sale.
- The allocation did **not** capture `branch_movement_id`. The observed
  reference-linked mirror is not sufficient authority for this repair to fill
  its metadata. The planner retained this as an unresolved review row.
- Original supplier/received costs remain missing. Commercial DP must not be
  substituted for these costs.
- No prescription dispensing session appeared in this bounded extract. Other
  legacy sessions, other receipts and branch/date scopes were not inspected;
  this review makes no claim that their evidence is complete.
- The production `mis_sales_audit` schema did not contain `source_key`, which
  the apply path requires. Operator confirmation of a merge is not proof of
  production schema readiness. No schema changes were attempted.

The extract was captured at `2026-10-14T10:10:36.809961Z`. A second read at
`2026-10-14T10:11:31.495Z` confirmed that the complete scoped sale, movement,
allocation, audit and mirror rows were unchanged. Both reads were SELECT-only;
there was no apply, sale replay, quantity change or financial posting.

Restricted evidence, the planner output and the second-read checks were retained
under `generated-artifacts/sale-repair/production-exact-reference-*.json`, excluded
from Git and deployment. These local files are not a database backup. The
extract SHA-256 is
`4d5ea316a3625f320e19fdbed85c1534dccc8090e52b577810d8d4e389569e15`.
The replica-derived candidate plan hash is
`bbc1ae8222edb9a22341f81ae0df155503a1f4ab7c7653c2e2d09e5240c042c7`
and its source fingerprint is
`29d4b51235baedd25140163f20eaab904d9c4090f9004bb62280da84ef00022d`.
These hashes record this review only: replica serialization and target identity
have not been validated against the primary CLI, so **do not use them as apply
approval values**.

**Status: review performed; live repair blocked.** No verified restorable backup
or hash-bound apply approval has been supplied. Before any apply, an authorized
operator must confirm primary-target/schema readiness through the supported
deployment process, run the canonical CLI read-only dry run on that target,
review its eligible and unresolved rows, retain its exact plan hash/fingerprint,
verify a restorable backup of that database and explicitly approve that exact
plan. Any changed evidence requires another dry run and review. Mirror and
legacy-session gaps must remain unresolved unless exact original linkage is
established. Preserve the CLI's before/after plans, invariant checks and
reconstructed provenance if a later, separately approved apply occurs.

### Follow-up review: Windhoek CBD prescriptions and current readiness

The operator requested code fixes and a read-only prescription review using
Windhoek CBD records. The branch registry identifies Windhoek CBD as `townshop`;
this is distinct from warehouse identities and from Tsumeb.

There were no prescription activity records or prescription movements for
14 October 2026. A branch-scoped date lookup identified 9 October 2026 as the
latest recorded prescription dispensing day at or before 14 October. Only that
single day was extracted for the prescription review:

- One activity session, `BAT-1791543953426-9E2UI7`, records a paid, posted partial
  dispense against `RPT-1791540815996-f6xnqx`. Its captured totals are quantity 1,
  commercial DP N$623 and customer charge N$810.
- One posted central prescription movement and one reference-linked branch
  mirror were observed for HERBA WARISAN MAHARANI 6 X 10G, batch `RCV-WI8JCQ`.
  They have no captured sale-evidence metadata. There is no sale allocation and
  no source-keyed sale completion audit for the reviewed reference.
- These are legacy evidence gaps, not authority to infer a session-to-movement
  mapping from matching names, quantities or nearby timestamps. Session totals
  must not be copied into individual movements, even when the bounded extract
  contains only one apparent candidate. No prescription repair is eligible on
  this evidence. The saved partial-dispense state, quantities, entitlement and
  financial records were left unchanged.

The prescription extract was captured at `2026-10-14T11:38:20.756629Z`.
A second read at `2026-10-14T11:41:02.762667Z` confirmed the complete scoped
sessions, movements, allocations, audits and mirrors were unchanged. Restricted
before/after evidence and the unresolved finding are retained locally in
`generated-artifacts/sale-repair/windhoek-cbd-prescription-evidence.json`.
The review covers this day only, not all Windhoek CBD prescription history.

A fresh exact-reference read also confirmed the original Tsumeb sale still has
one central movement, one allocation, one reference-linked mirror and no sale
audit event. The original mirror identity is still missing. A current SELECT-only
schema check found both `mis_sales_audit.source_key` and the required valid
unconditional unique index present, so the earlier schema blocker is resolved
as observed, without this task applying production DDL.

**Live apply remains blocked:** no correct-primary CLI plan, verified restorable
backup record or explicit hash-bound apply approval has been obtained. The
replica reviews and passing isolated tests are not substitutes for these.

The operator subsequently chose to finish the code fixes and read-only review
only. Completion of this work does not authorize a production apply or assert
that historical records have been repaired. Backup verification, a fresh
correct-primary CLI plan and explicit approval of that exact plan remain
separate prerequisites for any later live operation.

### Operator handoff — no live operation authorized

The current scope is code safeguards and read-only review only. No backup has
been verified by this task, no primary CLI plan has been obtained here, and no
approval is recorded. The example apply command above is documentation, not
permission to run it. An agent must not supply `--backup-verified` on behalf of
the operator or treat task completion as authorization.

For a later, separately authorized operation, the operator must:

1. Independently confirm the intended primary database through the supported
   operational process. Do not copy credentials into reports. Run the canonical
   CLI dry run for `TU-2026-000122` (the same sale as
   `WALK-1791966024927-UDFO`) on that target. Retain the original restricted JSON
   report, including primary/schema readiness and every eligible and review row.
   Do not use the replica hashes printed in the earlier review.
2. Review the exact proposed metadata and reconstructed audit provenance. The
   previously observed eligible central evidence is not authority to repair the
   uncaptured branch mirror. The reviewed Windhoek CBD prescription remains
   ineligible: its original allocation/completion linkage is absent. No inferred
   mirror IDs, prescription sessions, catalogue prices or received costs.
3. Obtain a backup of that exact database and verify restoration to a separate
   safe target using the database's supported restore procedure. Retain a
   restricted verification record with backup identity/checksum, capture time,
   confirmed source target, restore-test result/time and verifying operator.
   A nonempty file, replica extract or passing test is not proof of restorability.
4. Record explicit authorization naming the exact reference, CLI report,
   `planHash`, source-and-target `fingerprint`, separate
   `readiness.databaseFingerprint`, backup verification record and the permitted
   metadata-only scope. **All of these are currently pending.** If the source,
   plan, target or readiness changes, obtain a fresh dry run and approval.
5. Only after separate authorization, use those exact approved values in the
   CLI. Preserve the apply report's before/after plans, invariant hashes,
   unchanged-quantities/postings check and reconstructed provenance alongside the
   approval and backup verification. Retain unresolved rows as unresolved.
   Never replay a sale, alter quantities/financial postings or run repair at
   startup.

Do not store restricted evidence or backups in Git, deployment assets or public
storage. This handoff deliberately leaves live backup verification and approval
to the authorized operator; it does not claim historical records are repaired.

The additional primary-target and explicit database-approval safeguards passed
28 focused unit checks, including rejection of replica/unknown-primary plans and
missing or malformed database approval arguments before database access.
JavaScript syntax and patch whitespace checks also passed. These checks used
fixtures and invalid CLI arguments only; no database connection, backup
verification, new production read or live apply was performed for this handoff.

The repair safeguard changes passed 22 focused unit checks and all 16 checks in
the sale-evidence database suite, using a newly created disposable database that
was removed afterward. These include original quantity conservation, mirror
identity conflicts, mirror-only repairs, preservation of nonblank/zero evidence,
read-only schema preflight, different-target rejection and invalid CLI arguments.

### Verification results

- 68 isolated database checks passed across the sale, stock lifecycle, atomic
  safety, cost, cross-portal and linked-reversal suites; 176 unit checks passed.
- The client production build passed (existing large-chunk warnings remain).
- A real authenticated 10%-discount non-member campaign sale/full-refund check
  proves that saved DP 90 reverses as 90, not 81, and that both DP reporting
  paths return net DP zero after catalogue prices change. Customer receipts
  and cash refunds separately net to zero.
- A read-only browser pass used `America/Los_Angeles` against the disposable UI.
  It confirmed the N$443 receipt, six actual open requests, saved N$341 DP
  ledger/card values with quantity -1, MIS filters/audit evidence, and Finance,
  GM and Director dashboard displays. The browser exposed remaining catalogue
  overlays in profit analysis and the Stock PDF, and shifted date-only labels.
- A limited continuation verified the corrected GM report (341 DP, 443 charged,
  102 commercial margin, 70 original CIF, 373 actual profit), Stock all-branches
  PDF (1–14 October, saved 341 DP), and Finance as-of date (14 October).
  Director's separate old profit overlay was then replaced with that same
  verified GM saved-evidence component; its import/render wiring is covered by
  the client build, without another full browser run. The unused legacy
  Director scenario component is not mounted.
- Reports/screenshots from the disposable checks are under
  `generated-artifacts/sale-evidence-ui` (ignored, not deployment assets).
