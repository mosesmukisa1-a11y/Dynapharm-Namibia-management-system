import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js"; /**
 * refundGhostCleanup.js
 *
 * Cleans up NULL-expiry ghost rows created by pre-fix refund approvals.
 *
 * Before the expiry-resolution fix, every refund approval that could not UPDATE
 * an existing BIB row fell through to an INSERT with NULL expiry_date and
 * source_warehouse = NULL, id prefix = 'BIB-RFND-'.  These ghost rows:
 *   • double-count inventory (real batch + ghost both positive)
 *   • sort last under FEFO (NULL expiry_date NULLS LAST) and never get sold
 *
 * Strategy: for each ghost row, if there is a matching non-NULL expiry batch for
 * the same (branch, product, batch_no), merge the ghost qty into it and delete
 * the ghost.  If no match exists, leave the row and log a warning.
 *
 * Returns { merged: number, orphans: number }
 */
import { query } from '../db.js';

export async function runRefundGhostCleanup() {
  const ghostRows = await __qd_executePlan(query, __qd_registeredPlan("api/services/refundGhostCleanup.js:22:0"), []);








  let merged = 0;
  let orphans = 0;

  for (const ghost of ghostRows?.rows || []) {
    try {
      // Find the canonical expiry-dated batch for this branch/product/batch_no
      const canon = await __qd_executePlan(query, __qd_registeredPlan("api/services/refundGhostCleanup.js:37:1"),








      [ghost.branch_id, ghost.product_name, ghost.batch_no]);


      if (canon.rows.length > 0) {
        // Merge qty into the real batch and remove the ghost
        await __qd_executePlan(query, __qd_registeredPlan("api/services/refundGhostCleanup.js:51:2"),





        [ghost.quantity, canon.rows[0].id]);

        await __qd_executePlan(query, __qd_registeredPlan("api/services/refundGhostCleanup.js:59:3"),

        [ghost.id]);

        merged++;
      } else {
        // No expiry-dated counterpart — leave for manual review
        orphans++;
        console.warn(
          `[refund-ghost-cleanup] Orphan ghost row ${ghost.id}: ` +
          `branch=${ghost.branch_id} product="${ghost.product_name}" ` +
          `batch_no=${ghost.batch_no ?? 'NULL'} qty=${ghost.quantity} — ` +
          `no non-NULL expiry batch found; manual review required`
        );
      }
    } catch (innerErr) {
      console.warn(`[refund-ghost-cleanup] Error processing ghost ${ghost.id}:`, innerErr.message);
    }
  }

  if (merged > 0) {
    console.log(`[refund-ghost-cleanup] Merged ${merged} NULL-expiry ghost BIB-RFND- row(s) into their canonical batches`);
  }
  if (orphans > 0) {
    console.warn(`[refund-ghost-cleanup] ${orphans} ghost row(s) could not be merged (no matching expiry-dated batch) — see warnings above`);
  }
  if (merged === 0 && orphans === 0) {
    console.log('[refund-ghost-cleanup] No NULL-expiry ghost refund rows found — nothing to clean up');
  }

  return { merged, orphans };
}
