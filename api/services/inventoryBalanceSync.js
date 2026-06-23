import { query } from '../db.js';

/**
 * Syncs one or more branch_inventory_batches rows into inventory_balances.
 * Call this after any write to branch_inventory_batches to keep the Stock Manager
 * cache consistent with the Branch inventory view.
 *
 * Handles deduplication: if multiple rows exist for the same
 * (location_id, product_name, batch_no), keeps one and removes extras.
 *
 * @param {Array<{branch_id, product_name, batch_no, expiry_date, quantity, unit_price}>} rows
 */
export async function syncInventoryBalances(rows) {
  if (!rows || rows.length === 0) return;

  // Aggregate by (branch_id, product_name, batch_no) so that multiple
  // branch_inventory_batches rows sharing the same batch_no (but different
  // expiry dates) are SUMMED before writing to inventory_balances.
  // Without this, the last row overwrites earlier ones and the cache goes stale.
  const aggMap = new Map();
  for (const inv of rows) {
    const key = [
      (inv.branch_id || '').toLowerCase().trim(),
      (inv.product_name || '').toLowerCase().trim(),
      inv.batch_no || '',
    ].join('||');
    if (!aggMap.has(key)) {
      aggMap.set(key, { ...inv, quantity: 0 });
    }
    const entry = aggMap.get(key);
    entry.quantity += Number(inv.quantity || 0);
    if (inv.expiry_date) entry.expiry_date = inv.expiry_date;
    if (inv.unit_price)  entry.unit_price  = inv.unit_price;
  }

  for (const inv of aggMap.values()) {
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
           AND COALESCE(batch_no, '') = $3
         ORDER BY updated_at DESC NULLS LAST`,
        [inv.branch_id, inv.product_name, batchNoVal]
      );

      if (existing.rows.length > 1) {
        const keepId = existing.rows[0].id;
        const extraIds = existing.rows.slice(1).map(r => r.id);
        await query(
          `DELETE FROM inventory_balances WHERE id = ANY($1::text[])`,
          [extraIds]
        );
        await query(
          `UPDATE inventory_balances
           SET closing_qty    = $1,
               expiry_date    = COALESCE($2::date, expiry_date),
               unit_dp        = COALESCE($3, unit_dp),
               stock_value_dp = CASE WHEN $3 IS NOT NULL THEN $4 ELSE stock_value_dp END,
               updated_at     = NOW()
           WHERE id = $5`,
          [qty, expiryVal, unitDp, stockValue, keepId]
        );
      } else if (existing.rows.length === 1) {
        await query(
          `UPDATE inventory_balances
           SET closing_qty    = $1,
               expiry_date    = COALESCE($2::date, expiry_date),
               unit_dp        = COALESCE($3, unit_dp),
               stock_value_dp = CASE WHEN $3 IS NOT NULL THEN $4 ELSE stock_value_dp END,
               updated_at     = NOW()
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
