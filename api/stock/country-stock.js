import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne, query } from '../db.js';
import { recomputeLocationBalances } from '../services/stockEngine.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: list country stock ────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const [countryRows, allBalances] = await Promise.all([
        getMany(
          `SELECT product_name, batch_no, expiry_date,
                  closing_qty, inward_qty, outward_qty,
                  unit_dp, stock_value_dp, last_movement_date
           FROM inventory_balances
           WHERE location_type = 'country'
             AND location_id = 'country_stock'
             AND closing_qty > 0
           ORDER BY product_name ASC, expiry_date ASC NULLS LAST`
        ),
        getMany(
          `SELECT location_type, location_id, product_name, batch_no,
                  closing_qty, unit_dp, stock_value_dp
           FROM inventory_balances
           WHERE location_type IN ('country', 'warehouse', 'branch')
             AND closing_qty > 0
           ORDER BY location_type, location_id, product_name`
        ),
      ]);

      const distinctProducts = new Set(countryRows.map(r => r.product_name)).size;
      const totalUnits = countryRows.reduce((s, r) => s + Number(r.closing_qty || 0), 0);
      const stockValueDP = countryRows.reduce((s, r) => s + Number(r.stock_value_dp || 0), 0);
      const lowStockItems = countryRows.filter(r => Number(r.closing_qty || 0) < 10).length;

      const items = countryRows.map(r => ({
        productName: r.product_name,
        batchNo: r.batch_no || '',
        expiryDate: r.expiry_date,
        closingQty: Number(r.closing_qty || 0),
        inwardQty: Number(r.inward_qty || 0),
        outwardQty: Number(r.outward_qty || 0),
        unitDP: Number(r.unit_dp || 0),
        stockValueDP: Number(r.stock_value_dp || 0),
        lastMovementDate: r.last_movement_date,
      }));

      const locationBreakdown = {};
      for (const row of allBalances) {
        const key = `${row.location_type}||${row.location_id}`;
        if (!locationBreakdown[key]) {
          locationBreakdown[key] = {
            locationType: row.location_type,
            locationId: row.location_id,
            products: [],
            totalUnits: 0,
          };
        }
        locationBreakdown[key].products.push({
          productName: row.product_name,
          batchNo: row.batch_no || '',
          closingQty: Number(row.closing_qty || 0),
          unitDP: Number(row.unit_dp || 0),
          stockValueDP: Number(row.stock_value_dp || 0),
        });
        locationBreakdown[key].totalUnits += Number(row.closing_qty || 0);
      }

      const locationBreakdownList = Object.values(locationBreakdown).sort((a, b) => {
        const order = { country: 0, warehouse: 1, branch: 2 };
        if (order[a.locationType] !== order[b.locationType]) return order[a.locationType] - order[b.locationType];
        return a.locationId.localeCompare(b.locationId);
      });

      return res.status(200).json({
        success: true,
        summary: {
          distinctProducts,
          totalUnits,
          stockValueDP: parseFloat(stockValueDP.toFixed(2)),
          lowStockItems,
        },
        items,
        locationBreakdown: locationBreakdownList,
      });
    } catch (err) {
      console.error('Country stock GET error:', err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: err.message });
    }
    return;
  }

  // ── PUT: admin direct edit of a country stock batch ────────────────────────
  if (req.method === 'PUT') {
    try {
      const { user } = req;
      const role = (user?.role || '').toLowerCase();
      if (!['admin', 'superadmin', 'super_admin'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }

      const { productName, batchNo, remainingQty, expiryDate, newBatchNo, unitDp, notes, reason } = req.body;

      if (!productName) return res.status(400).json({ success: false, error: 'productName is required' });
      if (!reason || !reason.trim()) return res.status(400).json({ success: false, error: 'reason is required' });

      // Find the batch record (stock_batches uses 'description' for product name)
      const batch = await getOne(
        `SELECT id, remaining_quantity, expiry_date, batch_no, dpc_unit_value, notes
         FROM stock_batches
         WHERE location = 'country_stock'
           AND LOWER(TRIM(description)) = LOWER(TRIM($1))
           AND COALESCE(batch_no, '') = COALESCE($2, '')
         ORDER BY expiry_date ASC NULLS LAST
         LIMIT 1`,
        [productName, batchNo || null]
      );

      if (!batch) {
        return res.status(404).json({ success: false, error: `No country_stock batch found for ${productName} / ${batchNo || 'no batch'}` });
      }

      // Build SET clause for only provided fields
      const sets = [];
      const params = [];
      let p = 1;

      if (remainingQty !== undefined && remainingQty !== null && remainingQty !== '') {
        const qty = Number(remainingQty);
        if (isNaN(qty) || qty < 0) return res.status(400).json({ success: false, error: 'remainingQty must be a non-negative number' });
        sets.push(`remaining_quantity = $${p++}`);
        params.push(qty);
      }
      if (expiryDate !== undefined && expiryDate !== null && expiryDate !== '') {
        sets.push(`expiry_date = $${p++}`);
        params.push(expiryDate);
      }
      if (newBatchNo !== undefined && newBatchNo !== null && newBatchNo !== '') {
        sets.push(`batch_no = $${p++}`);
        params.push(newBatchNo.trim());
      }
      if (unitDp !== undefined && unitDp !== null && unitDp !== '') {
        const dp = Number(unitDp);
        if (isNaN(dp) || dp < 0) return res.status(400).json({ success: false, error: 'unitDp must be a non-negative number' });
        sets.push(`dpc_unit_value = $${p++}`);
        params.push(dp);
      }
      if (notes !== undefined && notes !== null) {
        sets.push(`notes = $${p++}`);
        params.push(notes);
      }

      if (sets.length === 0) {
        return res.status(400).json({ success: false, error: 'No fields provided to update' });
      }

      sets.push(`updated_at = NOW()`);
      params.push(batch.id);

      await query(
        `UPDATE stock_batches SET ${sets.join(', ')} WHERE id = $${p}`,
        params
      );

      // Audit entry in stock_movements
      await query(
        `INSERT INTO stock_movements
           (id, movement_type, source_location, source_location_type,
            destination_location, destination_location_type,
            product_name, batch_no, quantity, notes, status, created_at, updated_at)
         VALUES (gen_random_uuid(), 'adjustment', 'country_stock', 'country',
                 'country_stock', 'country',
                 $1, $2, 0, $3, 'posted', NOW(), NOW())`,
        [
          productName,
          batchNo || null,
          `Admin edit by ${user?.full_name || user?.username || 'admin'}: ${reason.trim()}`,
        ]
      );

      // Recompute inventory_balances cache
      recomputeLocationBalances('country', 'country_stock').catch(e =>
        console.error('[country-stock PUT] recompute error:', e.message)
      );

      return res.status(200).json({ success: true, message: 'Batch updated successfully' });
    } catch (err) {
      console.error('Country stock PUT error:', err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: err.message });
    }
    return;
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
