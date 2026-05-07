/**
 * GET /api/gm/daily-sales
 * Today's sales breakdown across all branches — all values at DP (distributor price).
 * Non-member walk-in: summed from item-level dpPrice (not branch_walkin_sales.total which is CP).
 * Prescription Rx: product_total_dp from branch_activity_transactions (non-member) or grand_total (member).
 * Returns: countrywide total + per-branch detail.
 */
import { getMany } from '../db.js';
import { applyAuthCors } from '../_lib/auth.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const dateParam = searchParams.get('date'); // optional override, defaults to today

  // Build the target date in Namibia time (UTC+2)
  let targetDate;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    targetDate = dateParam;
  } else {
    const now = new Date();
    const nbt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // UTC+2
    targetDate = nbt.toISOString().slice(0, 10);
  }

  const [walkinRows, refundRows, rxRows, priceListRows] = await Promise.all([
    // Walk-in sales — fetch items JSON to compute DP for non-members
    getMany(
      `SELECT branch_id, customer_type, payment_method, total, subtotal, items
       FROM branch_walkin_sales
       WHERE status = 'completed'
         AND sale_date::date = $1::date`,
      [targetDate]
    ),
    getMany(
      `SELECT branch_id, COALESCE(SUM(refund_amount), 0) AS refund_total
       FROM branch_refund_requests
       WHERE status = 'approved'
         AND processed_at::date = $1::date
       GROUP BY branch_id`,
      [targetDate]
    ),
    // Prescription dispensing DP from BAT
    getMany(
      `SELECT branch_id, grand_total, product_total_dp, client_type
       FROM branch_activity_transactions
       WHERE activity_type = 'prescription_dispensing'
         AND workflow_source != 'dispense_draft'
         AND payment_status = 'paid'
         AND service_date::date = $1::date`,
      [targetDate]
    ),
    // GM price list — authoritative DP source
    getMany(`SELECT description, dp FROM product_prices`),
  ]);

  // Build price-map from GM price list — authoritative DP for walk-in item calculations
  const priceMap = {};
  for (const p of priceListRows) {
    if (p.description) priceMap[p.description.toLowerCase().trim()] = Number(p.dp || 0);
  }
  const lookupDp = (name) => (name ? (priceMap[name.toLowerCase().trim()] || 0) : 0);

  // Build refund deduction map per branch
  const refundMap = new Map(refundRows.map(r => [r.branch_id, Number(r.refund_total || 0)]));

  // Aggregate walk-in DP per branch
  const branchMap = new Map();

  const ensureBranch = (branchId) => {
    if (!branchMap.has(branchId)) {
      branchMap.set(branchId, {
        branchId,
        transactionCount: 0,
        walkinDp: 0,
        memberDp: 0,
        nonMemberDp: 0,
        cashDp: 0,
        cardEftDp: 0,
        rxDp: 0,
      });
    }
    return branchMap.get(branchId);
  };

  for (const r of walkinRows) {
    const b = ensureBranch(r.branch_id);
    b.transactionCount++;

    const ct = (r.customer_type || '').toLowerCase();
    let amt;
    // Non-member walk-in: branch_walkin_sales.total = CP. Parse item-level DP.
    if (ct.includes('non') || (!ct.includes('member') && !ct.includes('online'))) {
      let items = [];
      try { items = typeof r.items === 'string' ? JSON.parse(r.items) : (Array.isArray(r.items) ? r.items : []); } catch {}
      amt = items.reduce((s, i) => {
        const nm = (i.product_name || i.name || i.description || '').trim();
        const dp = lookupDp(nm) || Number(i.dpPrice || i.dp || i.unit_price || 0);
        return s + dp * Number(i.quantity || i.qty || 1);
      }, 0);
    } else {
      // Member / online: pays at DP, total = DP
      amt = Number(r.total || r.subtotal || 0);
    }

    b.walkinDp += amt;
    if (ct.includes('member') && !ct.includes('non')) b.memberDp += amt;
    else b.nonMemberDp += amt;

    const pm = (r.payment_method || '').toLowerCase();
    if (pm === 'cash') b.cashDp += amt;
    else if (pm.includes('card') || pm === 'eft' || pm === 'swipe' || pm === 'transfer') b.cardEftDp += amt;
  }

  // Aggregate prescription DP per branch.
  // Always use product_total_dp (DP from price list = company money basis).
  // grand_total for Rx = CP (patient charge) for non-members — excluded from company revenue.
  for (const r of rxRows) {
    const b = ensureBranch(r.branch_id);
    b.rxDp += Number(r.product_total_dp || r.grand_total || 0);
  }

  // Apply refund deductions and compute per-branch totals
  const branchList = [...branchMap.values()].map(b => {
    const refund = refundMap.get(b.branchId) || 0;
    const walkinDp = Math.max(0, b.walkinDp - refund);
    const nonMemberDp = Math.max(0, b.nonMemberDp - refund);
    const revenue = walkinDp + b.rxDp;
    return {
      branchId: b.branchId,
      transactions: b.transactionCount,
      revenue: parseFloat(revenue.toFixed(2)),
      memberRevenue: parseFloat(b.memberDp.toFixed(2)),
      nonMemberRevenue: parseFloat(nonMemberDp.toFixed(2)),
      rxRevenue: parseFloat(b.rxDp.toFixed(2)),
      cashRevenue: parseFloat(b.cashDp.toFixed(2)),
      cardEftRevenue: parseFloat(b.cardEftDp.toFixed(2)),
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const totalRevenue      = branchList.reduce((s, b) => s + b.revenue, 0);
  const totalTransactions = branchList.reduce((s, b) => s + b.transactions, 0);
  const totalMember       = branchList.reduce((s, b) => s + b.memberRevenue, 0);
  const totalNonMember    = branchList.reduce((s, b) => s + b.nonMemberRevenue, 0);
  const totalRx           = branchList.reduce((s, b) => s + b.rxRevenue, 0);

  return res.json({
    success: true,
    date: targetDate,
    summary: {
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      totalTransactions,
      activeBranchCount: branchList.length,
      memberRevenue: parseFloat(totalMember.toFixed(2)),
      nonMemberRevenue: parseFloat(totalNonMember.toFixed(2)),
      rxRevenue: parseFloat(totalRx.toFixed(2)),
    },
    branches: branchList,
  });
}
