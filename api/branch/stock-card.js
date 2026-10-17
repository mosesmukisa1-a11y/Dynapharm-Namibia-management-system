import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne } from '../db.js';

function normalizeBranchId(raw) {
  if (!raw) return raw;
  return raw.toLowerCase().replace(/\s+/g, '_');
}

async function resolveBranchId(raw) {
  const key = normalizeBranchId(raw);
  if (!key) return key;
  const stripped = key.replace(/_branch$/, '');
  const candidates = [key];
  if (!key.endsWith('_branch')) candidates.push(key + '_branch');
  if (stripped !== key) candidates.push(stripped);
  const result = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/stock-card.js:17:0"),

  [candidates]);

  if (result) return result.branch_id;
  const ciResult = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/stock-card.js:22:1"),


  [candidates]);

  return ciResult ? ciResult.branch_id : key;
}

function fmtDt(d) {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : d;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const rawBranchId = url.searchParams.get('branchId') || url.searchParams.get('branch');
    const productIdParam = url.searchParams.get('productId') || url.searchParams.get('product_id');
    const productNameParam = url.searchParams.get('productName') || url.searchParams.get('product') || url.searchParams.get('product_name');
    const dateFrom = url.searchParams.get('date_from') || null;
    const dateTo = url.searchParams.get('date_to') || null;

    if (!rawBranchId) {
      return res.status(400).json({ success: false, error: 'branchId is required' });
    }
    if (!productIdParam && !productNameParam) {
      return res.status(400).json({ success: false, error: 'productId or productName is required' });
    }

    const branchId = await resolveBranchId(rawBranchId);

    // Resolve productName from productId if needed
    let productName = productNameParam;
    if (!productName && productIdParam) {
      const pRow = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/stock-card.js:60:2"),

      [branchId, productIdParam]);

      if (pRow) {
        productName = pRow.product_name;
      } else {
        const pRow2 = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/stock-card.js:67:3"),

        [branchId, productIdParam]);

        productName = pRow2 ? pRow2.product_name : productIdParam;
      }
    }

    const movParams = [branchId, productName];
    const movWhere = [__qd_registeredPlan("api/branch/stock-card.js:76:4"), __qd_registeredPlan("api/branch/stock-card.js:77:5")];



    if (dateFrom) {movParams.push(dateFrom);movWhere.push(__qd_registeredPlan("api/branch/stock-card.js:79:6", [movParams.length]));}
    if (dateTo) {movParams.push(dateTo + 'T23:59:59');movWhere.push(__qd_registeredPlan("api/branch/stock-card.js:80:7", [movParams.length]));}

    const movRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/stock-card.js:83:8", [__qd_joinPlans(



      movWhere, "and")]),

    movParams);


    const batchRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/stock-card.js:92:9"),



    [branchId, productName]);


    const currentQty = batchRows.reduce((s, b) => s + Number(b.quantity || 0), 0);

    const inwardTypes = new Set(['receive', 'received', 'stock_receipt', 'transfer_in', 'return', 'return_in', 'adjustment']);
    const outwardTypes = new Set(['sale', 'walk_in_member_sale', 'walk_in_non_member_sale', 'write_off', 'transfer_out', 'field_use', 'return_out', 'dispense', 'prescription_dispense', 'online_order_sale']);

    let totalIn = 0;
    let totalOut = 0;
    for (const m of movRows) {
      const t = (m.type || '').toLowerCase();
      const q = Math.abs(Number(m.quantity || 0));
      if (inwardTypes.has(t)) totalIn += q;
      if (outwardTypes.has(t)) totalOut += q;
    }

    const openingBalance = Math.max(0, currentQty - totalIn + totalOut);

    let running = openingBalance;
    const ledger = movRows.map((m, idx) => {
      const t = (m.type || '').toLowerCase();
      const q = Math.abs(Number(m.quantity || 0));
      const isIn = inwardTypes.has(t);
      const isOut = outwardTypes.has(t);
      const balanceBefore = running;
      if (isIn) running += q;else
      if (isOut) running -= q;
      return {
        rowIndex: idx + 1,
        id: m.id,
        date: fmtDt(m.created_at),
        type: m.type,
        productName: m.product_name,
        batchNo: m.batch_no || null,
        quantity: q,
        direction: isIn ? 'in' : isOut ? 'out' : 'neutral',
        unitPrice: m.unit_price !== null ? Number(m.unit_price) : null,
        reference: m.reference || null,
        notes: m.notes || null,
        createdBy: m.created_by || null,
        balanceBefore,
        balanceAfter: running
      };
    });

    const typeMap = {
      receive: 'Stock Receipt', received: 'Stock Receipt', stock_receipt: 'Stock Receipt',
      sale: 'Walk-in Sale', walk_in_member_sale: 'Member Sale', walk_in_non_member_sale: 'Non-member Sale',
      write_off: 'Write Off', transfer_in: 'Transfer In', transfer_out: 'Transfer Out',
      field_use: 'Field Use', return: 'Return In', return_in: 'Return In', return_out: 'Return Out',
      adjustment: 'Adjustment', dispense: 'Prescription Dispense', prescription_dispense: 'Prescription Dispense',
      online_order_sale: 'Online Order Sale'
    };

    const ledgerWithLabels = ledger.map((r) => ({ ...r, typeLabel: typeMap[r.type] || (r.type || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }));

    const closingBalance = running;
    const totalDispensed = movRows.filter((m) => ['dispense', 'prescription_dispense'].includes((m.type || '').toLowerCase())).
    reduce((s, m) => s + Math.abs(Number(m.quantity || 0)), 0);
    const totalWalkin = movRows.filter((m) => ['sale', 'walk_in_member_sale', 'walk_in_non_member_sale', 'online_order_sale'].includes((m.type || '').toLowerCase())).
    reduce((s, m) => s + Math.abs(Number(m.quantity || 0)), 0);
    const totalReceived = movRows.filter((m) => inwardTypes.has((m.type || '').toLowerCase())).
    reduce((s, m) => s + Math.abs(Number(m.quantity || 0)), 0);
    const totalWriteOff = movRows.filter((m) => ['write_off'].includes((m.type || '').toLowerCase())).
    reduce((s, m) => s + Math.abs(Number(m.quantity || 0)), 0);
    const totalTransferOut = movRows.filter((m) => ['transfer_out', 'field_use', 'return_out'].includes((m.type || '').toLowerCase())).
    reduce((s, m) => s + Math.abs(Number(m.quantity || 0)), 0);

    const formulaParts = [`Opening ${openingBalance}`];
    if (totalReceived > 0) formulaParts.push(`+ Received ${totalReceived}`);
    if (totalWalkin > 0) formulaParts.push(`− Walk-in ${totalWalkin}`);
    if (totalDispensed > 0) formulaParts.push(`− Dispensed ${totalDispensed}`);
    if (totalTransferOut > 0) formulaParts.push(`− Transfer Out ${totalTransferOut}`);
    if (totalWriteOff > 0) formulaParts.push(`− Write-off ${totalWriteOff}`);
    formulaParts.push(`= Closing ${closingBalance}`);

    return res.json({
      success: true,
      branchId,
      productName,
      batches: batchRows.map((b) => ({
        id: b.id,
        batchNo: b.batch_no,
        expiryDate: b.expiry_date ? b.expiry_date instanceof Date ? b.expiry_date.toISOString().slice(0, 10) : String(b.expiry_date).slice(0, 10) : null,
        quantity: Number(b.quantity || 0),
        unitPrice: b.unit_price !== null ? Number(b.unit_price) : null
      })),
      summary: {
        openingBalance,
        totalReceived,
        totalWalkinSold: totalWalkin,
        totalDispensed,
        totalTransferOut,
        totalWriteOff,
        closingBalance,
        formula: formulaParts.join(' ')
      },
      ledger: ledgerWithLabels
    });
  } catch (err) {
    console.error('[branch/stock-card] error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
