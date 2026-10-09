# Controlled counts, inspections and supplier returns

The **Controlled Counts & Returns** tab is available in Stock, Branch, GM and Finance. Staff submit operations; only GM/admin roles approve physical changes. Finance records supplier credit notes and reviews the linked journal.

## Physical counts

1. Select branch or warehouse batches, including depleted batches, and enter a session reason.
2. Save a draft to establish the cutoff and capture the existing batch identity and expected base-unit quantity. Count quantities must represent that cutoff, not a later unadjusted count taken after intervening transactions. The screen explains this policy.
3. Enter a whole base-unit count and a reason for each line. Submit the complete session. Submission makes no physical changes.
4. GM reviews any subset of pending lines; other lines remain pending. Approved lines are never posted again. A partially reviewed session is retained in the register.

Approval uses:

```
approved difference = counted at cutoff - expected at cutoff
new physical quantity = locked current physical quantity + approved difference
```

For example, expected 100 and counted 90 gives a difference of -10. If sales reduce current stock to 80 before approval, approval leaves 70, not 90. If that difference would make current stock negative, approval fails atomically and requires a recount. A batch identity/cost change requires a new reviewed submission rather than silently changing the audit evidence.

Only one open count may cover a particular physical batch. Cancel a draft or review/reject its pending line before starting another cutoff. Depleted batch rows are retained, so intervening sales do not erase count or return provenance.

## Supplier returns

Use original source-linked physical or segregated batches. A linked supplier import and recorded original CIF cost are mandatory. Missing evidence is an explicit error; a catalogue price or similarly named lot is not a replacement.

Normal branch transfer receipts now preserve an exact verified source batch and freeze its original import/cost evidence, including subsequent partial receipts into the same row. Multiple indistinguishable source layers are flagged as unresolved rather than selecting a convenient cost or trusting client-supplied source metadata. Historical rows are not backfilled on startup.

Receiving into a positive-quantity unlinked row, or mixing different original sources, preserves unknown/mixed provenance and blocks supplier-return eligibility for that coarse row. It does not attribute all older quantities to the new import. Distinct, fully allocated cost layers remain part of the separate broader costing implementation.

- Staff submit quantities, conditions and reasons.
- GM may approve individual lines and smaller quantities. The unapproved quantity on a reviewed line is explicitly rejected; other pending lines are unaffected.
- Approval moves stock out of available quantities into a separate supplier-return hold. Total on-hand stock, including segregation, is unchanged until dispatch.
- Staff dispatch against approved holds, with a shipment reference. Partial dispatches are cumulative and cannot exceed the approval. Dispatch does not deduct available source stock a second time.
- Each dispatch creates a supplier-return receivable and an original-import credit record valued at the original batch cost.
- Once all lines have been reviewed and approved quantities fully dispatched, Finance/GM records each original import's actual credit amount and supplier credit-note reference. Any difference from expected credit is recorded separately as a financial gain/loss. Multi-import returns require separate credit records. A recorded credit cannot be replayed.

## Inspection and segregation

Staff propose segregation of available stock, or a disposition of already segregated stock. GM approval is required to move or dispose of quantities.

- Conditions are saleable, quarantine, damaged or expired.
- Release requires a saleable inspection, original available-batch identity and an unexpired lot. Stock remains saleable through its Africa/Windhoek expiry date.
- Originally damaged or expired goods and supplier-return holds cannot be released to available stock.
- Write-off consumes segregated quantities and posts the original-cost loss; missing original cost prevents financial posting.
- New damaged/expired/quarantined customer refunds are stored separately with their recoverable original source links. Unknown historical provenance is not guessed and existing quarantine evidence is not migrated into physical stock automatically.
- If a newly accepted quarantined customer return has no remaining original branch row, its accepted refund and original sale evidence are retained. Only GM-approved saleable inspection may create its empty available destination and move the accepted quantity there. Original sale CIF evidence may be reused; an unknown supplier link stays unknown, so supplier return still requires separately verified supplier evidence.
- New campaign, walk-in and dispensing movements record the locked physical source allocation and its original cost/import snapshot. Refund provenance uses that recorded original-sale allocation, never whichever matching lot is currently available. Older sales without supplier proof retain missing supplier identity even when their recorded CIF cost is known. Multiple different original allocation identities are not collapsed into a guessed supplier.
- A direct saleable refund or GM-approved inspection release that merges with a different/unknown available source marks the resulting coarse row as mixed, preserving the physical quantities but blocking unsupported supplier credits. A quarantined return with proved original identity can be returned to its original supplier without affecting another supplier's currently available lot.
- Refund classification uses the original sold expiry where available. Different expiry allocations require explicit identification rather than choosing a newer matching available batch.

The screen distinguishes source physical quantities from available quantities and from segregated quantities. Counts and return requests use integer base units, never inferred cartons or pack factors.

## Safety and audit

Each mutation, physical update, stock movement, supplier record and financial entry shares one transaction. Errors roll back all selected lines. Current source rows and operation records are locked to serialize sales, approvals and repeated submissions. Count/inspection movements preserve original lot and expiry; financial entries record debit/credit accounts and operational references.

Branch staff can access only assigned branches; warehouse stock and cross-branch operations require appropriate stock/GM access. Approval is server-enforced, not just hidden in the UI.

No startup routine in this feature rewrites historical physical stock. Its schema changes are additive. Historical reconciliation and full sale/dispatch reversals remain separate work.
