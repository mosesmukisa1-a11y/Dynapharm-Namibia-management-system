/**
 * GET /api/stock/discrepancies
 * Returns stock transfers where discrepancy_flag = true,
 * so Finance and GM staff can review short-receipt incidents.
 * Accessible by: admin, gm, general_manager, finance, director
 */
import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Auth required' });
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const ALLOWED = new Set(['admin', 'gm', 'general_manager', 'director', 'finance', 'finance_manager']);
  if (!ALLOWED.has((req.user?.role || '').toLowerCase())) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  try {
    const url    = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const branch = url.searchParams.get('branch') || null;
    const limit  = Math.min(Number(url.searchParams.get('limit') || 100), 200);
    const offset = Number(url.searchParams.get('offset') || 0);

    const conditions = ['t.discrepancy_flag = true'];
    const params = [];

    if (branch) {
      params.push(branch);
      conditions.push(
        `LOWER(REPLACE(t.to_branch, ' ', '_')) = LOWER(REPLACE($${params.length}, ' ', '_'))`
      );
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await getMany(
      `SELECT
         t.id,
         t.request_number,
         t.from_warehouse,
         t.to_branch,
         t.status,
         t.discrepancy_flag,
         t.discrepancy_note,
         t.received_by,
         t.dispatch_date,
         t.created_at,
         t.updated_at,
         COALESCE(
           json_agg(
             jsonb_build_object(
               'productName',        i.product_name,
               'quantityDispatched', COALESCE(i.quantity_approved, i.quantity),
               'quantityReceived',   i.quantity_received,
               'discrepancyNote',    i.discrepancy_note,
               'batchNo',            i.batch_no,
               'expiryDate',         i.expiry_date
             )
             ORDER BY i.product_name
           ) FILTER (WHERE i.id IS NOT NULL AND i.discrepancy_note IS NOT NULL),
           '[]'::json
         ) AS discrepancy_items,
         COUNT(*) OVER () AS total_count
       FROM stock_transfers t
       LEFT JOIN stock_transfer_items i ON i.transfer_id = t.id
       ${where}
       GROUP BY t.id
       ORDER BY t.updated_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      discrepancies: rows,
      count: rows.length,
      total: Number(rows[0]?.total_count ?? rows.length),
    });
  } catch (err) {
    console.error('[GET /api/stock/discrepancies]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
