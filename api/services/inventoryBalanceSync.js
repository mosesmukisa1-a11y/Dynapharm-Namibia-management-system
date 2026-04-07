import { query } from '../db.js';

/**
 * Syncs one or more branch_inventory_batches rows into inventory_balances.
 * Call this after any write to branch_inventory_batches to keep the Stock Manager
 * cache consistent with the Branch inventory view.
 *
 * @param {Array<{branch_id, product_name, batch_no, expiry_date, quantity, unit_price}>} rows
 */
export async function syncInventoryBalances(rows) {
  if (!rows || rows.length === 0) return;
  for (const inv of rows) {
    try {
      const batchNoVal = inv.batch_no || '';
      const expiryVal = inv.expiry_date
        ? (inv.expiry_date instanceof Date
            ? inv.expiry_date.toISOString().slice(0, 10)
            : String(inv.expiry_date).slice(0, 10))
        : null;
      const qty = Number(inv.quantity || 0);
      const unitDp = inv.unit_price ? Number(inv.unit_price) : null;
      const stockValue = unitDp ? qty * unitDp : 0;

      const existing = await query(
        `SELECT id FROM inventory_balances
         WHERE location_type = 'branch'
           AND LOWER(TRIM(location_id)) = LOWER(TRIM($1))
           AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
           AND COALESCE(batch_no, '') = $3`,
        [inv.branch_id, inv.product_name, batchNoVal]
      );

      if (existing.rows.length > 0) {
        await query(
          `UPDATE inventory_balances
           SET closing_qty = $1,
               expiry_date = COALESCE($2::date, expiry_date),
               unit_dp = COALESCE($3, unit_dp),
               stock_value_dp = CASE WHEN $3 IS NOT NULL THEN $4 ELSE stock_value_dp END,
               updated_at = NOW()
           WHERE id = $5
             AND ABS(closing_qty - $1) > 0`,
          [qty, expiryVal, unitDp, stockValue, existing.rows[0].id]
        );
      } else if (qty > 0) {
        const balId = `BAL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        await query(
          `INSERT INTO inventory_balances
             (id, location_type, location_id, product_name, batch_no, expiry_date,
              opening_qty, inward_qty, outward_qty, closing_qty, unit_dp, stock_value_dp, updated_at)
           VALUES ($1,'branch',$2,$3,$4,$5::date,0,0,0,$6,$7,$8,NOW())
           ON CONFLICT DO NOTHING`,
          [balId, inv.branch_id, inv.product_name, batchNoVal, expiryVal, qty, unitDp, stockValue]
        );
      }
    } catch (err) {
      console.error('[inventoryBalanceSync] sync error for', inv.branch_id, inv.product_name, ':', err.message);
    }
  }
}

/**
 * Fetch current branch_inventory_batches rows for a branch+product+batch
 * and sync them into inventory_balances. Useful after a mutation.
 *
 * @param {string} branchId
 * @param {string} productName
 * @param {string|null} batchNo
 */
export async function syncBranchProductBalance(branchId, productName, batchNo = null) {
  try {
    const params = [branchId, productName];
    let filter = `WHERE LOWER(TRIM(branch_id)) = LOWER(TRIM($1))
                    AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))`;
    if (batchNo !== null) {
      filter += ` AND COALESCE(batch_no, '') = $3`;
      params.push(batchNo);
    }
    const rows = await query(
      `SELECT branch_id, product_name, batch_no, expiry_date, quantity, unit_price
       FROM branch_inventory_batches ${filter}`,
      params
    );
    await syncInventoryBalances(rows.rows);
  } catch (err) {
    console.error('[inventoryBalanceSync] syncBranchProductBalance error:', err.message);
  }
}
