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

After operator review and a genuine database backup, apply to the same database:

```sh
node scripts/repair-sale-evidence.mjs --reference TU-2026-000122 \
  --apply --approve REVIEWED_PLAN_HASH --fingerprint REVIEWED_FINGERPRINT \
  --backup /secure/path/to/reviewed-backup-file
```

The tool checks that the backup file exists and is nonempty; the operator must
verify that it is a restorable backup of the correct database. Stale plans fail.
Apply runs serializably, fills only missing movement/mirror/allocation metadata,
preserves nonblank evidence including zero, and inserts reconstructed-provenance
audit events with original actors/timestamps when available. It returns before
and after plans plus an invariant check of stock quantities and receipt values.
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

These checks do not verify the supplied historical receipt in production.
No production sale, quantity repair, or historical apply is authorized or performed.

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
