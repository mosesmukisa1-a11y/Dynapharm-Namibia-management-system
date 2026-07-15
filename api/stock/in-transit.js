/**
 * GET /api/stock/in-transit
 * Live in-transit visibility dashboard (#14).
 * Returns all transfers currently dispatched or in_transit with
 * time-in-flight, expected arrival, and per-item detail.
 * Accessible by: admin, gm, stock, branch (filtered to own branch)
 */
import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Auth required' });
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url   = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const role  = (req.user?.role || '').toLowerCase();
    const userBranch = normalizeBranchSlug(req.user?.branch || '') || req.user?.branch || null;

    const MANAGER_ROLES = new Set(['admin', 'gm', 'general_manager', 'director', 'stock', 'stock_manager']);
    const isManager = MANAGER_ROLES.has(role);

    // Branch users only see their own incoming transfers
    const branchFilter = isManager
      ? (url.searchParams.get('branch') || null)
      : userBranch;

    const IN_TRANSIT_STATUSES = ['dispatched', 'in_transit'];

    const conditions = [`st.status = ANY($1::text[])`];
    const params     = [IN_TRANSIT_STATUSES];

    if (branchFilter) {
      params.push(branchFilter);
      conditions.push(`(LOWER(REPLACE(st.to_branch,' ','_')) = LOWER(REPLACE($${params.length},' ','_')))`);
    }

    const transfers = await getMany(
      `SELECT
         st.id,
         st.from_warehouse,
         st.to_branch,
         st.status,
         st.dispatch_reference,
         st.dispatch_notes,
         st.dispatched_by,
         st.dispatched_at,
         st.expected_arrival,
         st.gm_approved_by,
         st.created_by,
         st.created_at,
         st.updated_at,
         EXTRACT(EPOCH FROM (NOW() - st.updated_at)) / 3600 AS hours_in_flight,
         dn.barcode      AS dispatch_barcode,
         dn.id           AS dispatch_note_id
       FROM stock_transfers st
       LEFT JOIN dispatch_notes dn ON dn.transfer_id = st.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY st.updated_at ASC`,
      params
    );

    if (transfers.length === 0) {
      return res.json({ success: true, transfers: [], totalInTransit: 0, totalItems: 0 });
    }

    // Load items for all in-transit transfers
    const transferIds = transfers.map(t => t.id);
    const allItems = await getMany(
      `SELECT transfer_id, product_name,
              COALESCE(quantity_approved, quantity) AS quantity,
              batch_no, expiry_date
       FROM stock_transfer_items
       WHERE transfer_id = ANY($1::text[])`,
      [transferIds]
    );

    const itemsByTransfer = new Map();
    for (const item of allItems) {
      if (!itemsByTransfer.has(item.transfer_id)) itemsByTransfer.set(item.transfer_id, []);
      itemsByTransfer.get(item.transfer_id).push(item);
    }

    const enriched = transfers.map(t => {
      const items = itemsByTransfer.get(t.id) || [];
      const totalQty  = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
      const hoursInFlight = parseFloat((t.hours_in_flight || 0).toFixed(1));
      const isOverdue = hoursInFlight > 24;

      return {
        transferId:     t.id,
        fromWarehouse:  (t.from_warehouse || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        fromWarehouseId: t.from_warehouse,
        toBranch:       (t.to_branch || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        toBranchId:     t.to_branch,
        status:         t.status,
        dispatchRef:    t.dispatch_reference,
        dispatchNoteId: t.dispatch_note_id,
        dispatchBarcode: t.dispatch_barcode,
        dispatchedBy:   t.dispatched_by,
        dispatchedAt:   t.dispatched_at,
        expectedArrival: t.expected_arrival,
        approvedBy:     t.gm_approved_by,
        createdBy:      t.created_by,
        hoursInFlight,
        isOverdue,
        overdueFlag:    isOverdue ? `⚠️ ${Math.floor(hoursInFlight)}h in transit` : null,
        totalQty,
        itemCount:      items.length,
        items:          items.map(i => ({
          productName: i.product_name,
          quantity:    Number(i.quantity || 0),
          batchNo:     i.batch_no,
          expiryDate:  i.expiry_date,
        })),
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      };
    });

    const totalQty = enriched.reduce((s, t) => s + t.totalQty, 0);

    return res.json({
      success: true,
      transfers:      enriched,
      totalInTransit: enriched.length,
      totalItems:     totalQty,
      overdueCount:   enriched.filter(t => t.isOverdue).length,
    });
  } catch (err) {
    console.error('[in-transit]', err.message);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
