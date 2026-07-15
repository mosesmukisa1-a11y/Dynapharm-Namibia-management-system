/**
 * GET /api/stock/expiry-priority-batches
 * Automation #9 — Expiry-priority dispatch suggestion.
 * Returns warehouse stock_batches for a given product (or all products)
 * sorted by soonest-expiring first, flagging batches expiring within 90 days.
 * Used when creating dispatches so stock managers see FEFO-order clearly
 * and can prioritise batches near expiry.
 */
import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

const EXPIRY_WARNING_DAYS = 90;

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Auth required' });
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const ALLOWED = new Set(['admin','gm','general_manager','director','stock','stock_manager','branch','branch_manager']);
  if (!ALLOWED.has((req.user?.role || '').toLowerCase())) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  try {
    const url       = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const product   = url.searchParams.get('product') || url.searchParams.get('product_name') || null;
    const warehouse = url.searchParams.get('warehouse') || url.searchParams.get('location') || null;
    const minQty    = Number(url.searchParams.get('min_qty') || 1);

    const conditions = [`sb.remaining_quantity >= $1`, `sb.status = 'available'`];
    const params     = [minQty];

    if (product) {
      params.push(`%${product}%`);
      conditions.push(`sb.description ILIKE $${params.length}`);
    }
    if (warehouse) {
      params.push(warehouse);
      conditions.push(`(LOWER(REPLACE(sb.location,' ','_')) = LOWER(REPLACE($${params.length},' ','_')) OR LOWER(REPLACE(COALESCE(sb.warehouse_id,''),' ','_')) = LOWER(REPLACE($${params.length},' ','_')))`);
    } else {
      // Default: only warehouse/country_stock (not branch) batches
      conditions.push(`(sb.location ILIKE '%warehouse%' OR sb.location = 'country_stock')`);
    }

    const batches = await getMany(
      `SELECT
         sb.id,
         sb.description          AS product_name,
         sb.batch_no,
         sb.expiry_date,
         sb.remaining_quantity,
         sb.dispatched_quantity,
         sb.quantity             AS original_quantity,
         sb.location,
         sb.warehouse_id,
         sb.dpc_unit_value       AS unit_dp,
         sb.cif_unit_cost        AS unit_cif,
         sb.import_date,
         sb.supplier_name,
         sb.import_reference,
         CASE
           WHEN sb.expiry_date IS NULL THEN NULL
           ELSE (sb.expiry_date::date - CURRENT_DATE)
         END AS days_to_expiry,
         CASE
           WHEN sb.expiry_date IS NULL THEN false
           WHEN (sb.expiry_date::date - CURRENT_DATE) < 0 THEN true
           ELSE false
         END AS is_expired,
         CASE
           WHEN sb.expiry_date IS NULL THEN false
           WHEN (sb.expiry_date::date - CURRENT_DATE) <= $${params.length + 1} THEN true
           ELSE false
         END AS expiry_warning
       FROM stock_batches sb
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE WHEN sb.expiry_date IS NULL THEN 1 ELSE 0 END,
         sb.expiry_date ASC,
         sb.import_date ASC`,
      [...params, EXPIRY_WARNING_DAYS]
    );

    // Summary stats
    const total        = batches.length;
    const expired      = batches.filter(b => b.is_expired).length;
    const nearExpiry   = batches.filter(b => b.expiry_warning && !b.is_expired).length;
    const healthyCount = total - expired - nearExpiry;

    // Group by product for easy display
    const byProduct = new Map();
    for (const b of batches) {
      const key = (b.product_name || '').trim().toLowerCase();
      if (!byProduct.has(key)) byProduct.set(key, { productName: b.product_name, batches: [] });
      byProduct.get(key).batches.push({
        batchId:          b.id,
        productName:      b.product_name,
        batchNo:          b.batch_no,
        expiryDate:       b.expiry_date,
        daysToExpiry:     b.days_to_expiry !== null ? Number(b.days_to_expiry) : null,
        isExpired:        b.is_expired,
        expiryWarning:    b.expiry_warning,
        remainingQty:     Number(b.remaining_quantity),
        dispatchedQty:    Number(b.dispatched_quantity || 0),
        originalQty:      Number(b.original_quantity || 0),
        location:         b.location,
        warehouseId:      b.warehouse_id,
        unitDP:           Number(b.unit_dp || 0),
        unitCIF:          Number(b.unit_cif || 0),
        importDate:       b.import_date,
        supplierName:     b.supplier_name,
        importReference:  b.import_reference,
        urgencyFlag:
          b.is_expired        ? '🔴 EXPIRED — dispatch immediately or write off'
          : b.expiry_warning  ? `🟡 Expiring in ${b.days_to_expiry} days — prioritise`
          : null,
      });
    }

    return res.json({
      success: true,
      product:       product || null,
      warehouse:     warehouse || 'all warehouses',
      warningDays:   EXPIRY_WARNING_DAYS,
      totalBatches:  total,
      expired,
      nearExpiry,
      healthy:       healthyCount,
      batches,
      byProduct:     Array.from(byProduct.values()),
    });
  } catch (err) {
    console.error('[expiry-priority-batches]', err.message);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
