import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';

function classifyMovement(type = '') {
  const t = type.toLowerCase().trim();
  if (t === 'transfer_in' || t === 'receive' || t === 'received' || t === 'stock_receipt') return 'received';
  if (t === 'sale' || t === 'walk_in_member_sale' || t === 'walk_in_non_member_sale' || t === 'online_order_sale'
      || t === 'walkin_sale' || t === 'member_sale' || t === 'non_member_sale') return 'sold';
  if (t === 'dispense' || t === 'prescription_dispense' || t === 'field_use' || t === 'prescription_dispensing') return 'dispensed';
  if (t === 'transfer_out' || t === 'transfer') return 'transferred';
  if (t === 'write_off' || t === 'writeoff' || t === 'write_off_expired' || t === 'expiry') return 'written_off';
  return null;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const branchId = url.searchParams.get('branch_id') || '';
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const monthParam = url.searchParams.get('month');

    if (!branchId || branchId === 'all') {
      return res.status(400).json({ success: false, error: 'branch_id is required' });
    }

    let periodStart, periodEnd;
    if (monthParam) {
      const [year, month] = monthParam.split('-').map(Number);
      periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
      periodEnd = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    } else if (fromParam && toParam) {
      periodStart = fromParam;
      periodEnd = toParam;
    } else {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
      periodEnd = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    }

    const normBranch = branchId.toLowerCase().replace(/ /g, '_');

    // All stock_movements involving this branch (case-insensitive match)
    // Split into pre-period (for opening) and in-period (for flows)
    const [smPre, smIn, bimPre, bimIn] = await Promise.all([
      getMany(
        `SELECT product_name, movement_type, quantity,
                source_location, source_location_type,
                destination_location, destination_location_type,
                COALESCE(unit_dp, 0) as unit_dp,
                reference_id
         FROM stock_movements
         WHERE ((LOWER(REPLACE(destination_location, ' ', '_')) = $1 AND destination_location_type = 'branch')
            OR (LOWER(REPLACE(source_location, ' ', '_')) = $1 AND source_location_type = 'branch'))
           AND created_at < $2`,
        [normBranch, periodStart]
      ),
      getMany(
        `SELECT product_name, movement_type, quantity,
                source_location, source_location_type,
                destination_location, destination_location_type,
                COALESCE(unit_dp, 0) as unit_dp,
                reference_id
         FROM stock_movements
         WHERE ((LOWER(REPLACE(destination_location, ' ', '_')) = $1 AND destination_location_type = 'branch')
            OR (LOWER(REPLACE(source_location, ' ', '_')) = $1 AND source_location_type = 'branch'))
           AND created_at >= $2 AND created_at < $3`,
        [normBranch, periodStart, periodEnd]
      ),
      // branch_inventory_movements as supplementary source (catches POS sales not in stock_movements)
      getMany(
        `SELECT product_name, type as movement_type, ABS(quantity) as quantity,
                LOWER(REPLACE(branch_id, ' ', '_')) as source_location,
                'branch' as source_location_type,
                '' as destination_location,
                '' as destination_location_type,
                0 as unit_dp,
                reference as reference_id
         FROM branch_inventory_movements
         WHERE LOWER(REPLACE(branch_id, ' ', '_')) = $1
           AND created_at < $2`,
        [normBranch, periodStart]
      ),
      getMany(
        `SELECT product_name, type as movement_type, ABS(quantity) as quantity,
                LOWER(REPLACE(branch_id, ' ', '_')) as source_location,
                'branch' as source_location_type,
                '' as destination_location,
                '' as destination_location_type,
                0 as unit_dp,
                reference as reference_id
         FROM branch_inventory_movements
         WHERE LOWER(REPLACE(branch_id, ' ', '_')) = $1
           AND created_at >= $2 AND created_at < $3`,
        [normBranch, periodStart, periodEnd]
      ),
    ]);

    // Deduplicate: stock_movements wins over branch_inventory_movements for same reference
    const smPreRefs = new Set(smPre.map(r => r.reference_id).filter(Boolean));
    const smInRefs  = new Set(smIn.map(r => r.reference_id).filter(Boolean));

    const prePeriod = [
      ...smPre,
      ...bimPre.filter(r => !r.reference_id || !smPreRefs.has(r.reference_id)),
    ];
    const inPeriod = [
      ...smIn,
      ...bimIn.filter(r => !r.reference_id || !smInRefs.has(r.reference_id)),
    ];

    const normKey = (s) => (s || '').trim().toLowerCase();
    const nameMap = {};

    // Determine the sign of a movement from the branch's perspective
    // Inbound to branch = positive, outbound from branch = negative
    function branchSign(row) {
      const destIsBranch = row.destination_location === branchId && row.destination_location_type === 'branch';
      const srcIsBranch = row.source_location === branchId && row.source_location_type === 'branch';
      if (destIsBranch && !srcIsBranch) return 1;  // inbound
      if (srcIsBranch && !destIsBranch) return -1; // outbound
      if (srcIsBranch && destIsBranch) return 0;   // self-transfer
      return 0;
    }

    // Compute opening stock: net of all pre-period movements
    const openingMap = {};
    for (const r of prePeriod) {
      const k = normKey(r.product_name);
      if (!nameMap[k]) nameMap[k] = r.product_name;
      const sign = branchSign(r);
      const qty = Number(r.quantity || 0);
      openingMap[k] = (openingMap[k] || 0) + sign * qty;
    }

    // Compute period flows: categorize each movement
    const EMPTY = () => ({ received: 0, sold: 0, dispensed: 0, transferred: 0, written_off: 0, dp_sold: 0, dp_dispensed: 0 });
    const flowMap = {};
    for (const r of inPeriod) {
      const k = normKey(r.product_name);
      if (!nameMap[k]) nameMap[k] = r.product_name;
      if (!flowMap[k]) flowMap[k] = EMPTY();
      const f = flowMap[k];
      const qty = Number(r.quantity || 0);
      const dp = Number(r.unit_dp || 0) * qty;
      const cat = classifyMovement(r.movement_type);
      const sign = branchSign(r);

      if (sign > 0) {
        // Inbound movement
        f.received += qty;
      } else if (sign < 0) {
        // Outbound movement — categorize by type
        if (cat === 'sold') { f.sold += qty; f.dp_sold += dp; }
        else if (cat === 'dispensed') { f.dispensed += qty; f.dp_dispensed += dp; }
        else if (cat === 'transferred') f.transferred += qty;
        else if (cat === 'written_off') f.written_off += qty;
        else f.sold += qty; // default outflow as sold
      }
    }

    // Build product rows — closing computed purely from formula
    const allKeys = new Set([...Object.keys(openingMap), ...Object.keys(flowMap)]);

    const productRows = Array.from(allKeys).sort().map(k => {
      const opening = openingMap[k] || 0;
      const f = flowMap[k] || EMPTY();
      const closing = opening + f.received - f.sold - f.dispensed - f.transferred - f.written_off;

      return {
        product_name: nameMap[k] || k,
        opening_qty: Math.round(opening),
        received_qty: Math.round(f.received),
        sold_qty: Math.round(f.sold),
        dispensed_qty: Math.round(f.dispensed),
        transferred_qty: Math.round(f.transferred),
        written_off_qty: Math.round(f.written_off),
        closing_qty: Math.round(closing),
        dp_sold_value: parseFloat(f.dp_sold.toFixed(2)),
        dp_dispensed_value: parseFloat(f.dp_dispensed.toFixed(2)),
        dp_total_value: parseFloat((f.dp_sold + f.dp_dispensed).toFixed(2)),
      };
    });

    const totals = productRows.reduce((acc, r) => {
      acc.opening += r.opening_qty;
      acc.received += r.received_qty;
      acc.sold += r.sold_qty;
      acc.dispensed += r.dispensed_qty;
      acc.transferred += r.transferred_qty;
      acc.written_off += r.written_off_qty;
      acc.closing += r.closing_qty;
      acc.dp_total += r.dp_total_value;
      return acc;
    }, { opening: 0, received: 0, sold: 0, dispensed: 0, transferred: 0, written_off: 0, closing: 0, dp_total: 0 });

    res.status(200).json({
      success: true,
      branch_id: branchId,
      period_start: periodStart,
      period_end: periodEnd,
      products: productRows,
      totals: {
        opening_qty: Math.round(totals.opening),
        received_qty: Math.round(totals.received),
        sold_qty: Math.round(totals.sold),
        dispensed_qty: Math.round(totals.dispensed),
        transferred_qty: Math.round(totals.transferred),
        written_off_qty: Math.round(totals.written_off),
        closing_qty: Math.round(totals.closing),
        dp_total_value: parseFloat(totals.dp_total.toFixed(2)),
      },
    });
  } catch (err) {
    console.error('stock formula report error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
