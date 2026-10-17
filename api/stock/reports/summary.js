import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js";import { applyAuthCors } from '../../_lib/auth.js';
import { getMany, getOne } from '../../db.js';
import { canReadCompanyStock, storedFreshness, liveFreshness } from '../../services/stockReportFreshness.js';
import { getStockCostProjection } from '../../services/stockCostReporting.js';
import { inferLocationType } from '../../services/stockEngine.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (!canReadCompanyStock(req.user)) return res.status(403).json({ success: false, error: 'Company stock reporting access denied' });
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const from = url.searchParams.get('date_from') || null;
    const to = url.searchParams.get('date_to') || null;
    const period = url.searchParams.get('period') || null;
    const branchId = url.searchParams.get('branch_id') || null;

    // Precomputed-first: when a specific period is requested, serve stored summary immediately
    if (period) {
      let periodType, periodKey;
      if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {periodType = 'daily';periodKey = period;} else
      if (/^\d{4}-W\d{2}$/.test(period)) {periodType = 'weekly';periodKey = period;} else
      if (/^\d{4}-\d{2}$/.test(period)) {periodType = 'monthly';periodKey = period;}

      if (periodType) {
        const id = branchId ?
        `${periodType}-${periodKey}-${branchId.replace(/[^a-zA-Z0-9_]/g, '_')}` :
        `${periodType}-${periodKey}-all`;
        const stored = await __qd_executePlan(getOne, __qd_registeredPlan("api/stock/reports/summary.js:33:0"),

        [id]).
        catch(() => null);
        if (stored && stored.report_data?.cost_basis === 'received_batches_v1') {
          const data = typeof stored.report_data === 'string' ? JSON.parse(stored.report_data) : stored.report_data;
          const freshness = storedFreshness(stored.computed_at);
          if (freshness.state === 'unavailable') return res.status(503).json({ success: false, error: freshness.reason, freshness });
          return res.json({ ...data, success: true, source: 'precomputed', period_type: periodType, period_key: periodKey, computed_at: stored.computed_at, freshness });
        }
      }
      return res.status(503).json({ success: false, error: 'Requested stock summary is unavailable; no unbounded current-data substitution', freshness: { state: 'unavailable' }, period });
    }

    let dateFilter = __qd_registeredPlan("api/stock/reports/summary.js:46:1");
    const params = [];
    if (from) {params.push(from);dateFilter = __qd_joinPlans([dateFilter, __qd_registeredPlan("api/stock/reports/summary.js:48:2", [params.length])], "empty");}
    if (to) {params.push(to + 'T23:59:59');dateFilter = __qd_joinPlans([dateFilter, __qd_registeredPlan("api/stock/reports/summary.js:49:3", [params.length])], "empty");}

    // Sales and movement aggregates are computed in SQL to avoid LIMIT-truncation
    // issues when there are large numbers of transactions in the period.
    const salesParams2 = [...params];
    const movParams2 = [...params];

    const [projection, salesAgg, movAgg] = await Promise.all([
    getStockCostProjection(),
    // Aggregate in SQL — no row-count cap
    __qd_executePlan(getMany, __qd_registeredPlan("api/stock/reports/summary.js:60:4", [




    dateFilter]),

    salesParams2), __qd_executePlan(

      getMany, __qd_registeredPlan("api/stock/reports/summary.js:69:5", [


      dateFilter]),

      movParams2)]

    );

    const stock = projection.filter((r) => !branchId || r.location === branchId);
    const batches = stock.filter((r) => inferLocationType(r.location) === 'warehouse');
    const branchInv = stock.filter((r) => inferLocationType(r.location) === 'branch');
    const warehouseQty = batches.reduce((s, b) => s + b.qty, 0);
    const warehouseCIF = batches.reduce((s, b) => s + b.qty * (b.unitCIF ?? 0), 0);
    const warehouseDPC = batches.reduce((s, b) => s + b.qty * (b.unitDPC ?? 0), 0);
    const branchQty = branchInv.reduce((s, b) => s + b.qty, 0);
    const branchDPC = branchInv.reduce((s, b) => s + b.qty * (b.unitDPC ?? 0), 0);

    const totalRevenue = salesAgg.reduce((s, r) => s + Number(r.total_revenue || 0), 0);
    const transactionCount = salesAgg.reduce((s, r) => s + Number(r.tx_count || 0), 0);
    const memberRevenue = salesAgg.filter((r) => ['member', 'walk_in_member_sale', 'walkin_member_sale'].includes(r.customer_type)).reduce((s, r) => s + Number(r.total_revenue || 0), 0);
    const nonMemberRevenue = salesAgg.filter((r) => !['member', 'walk_in_member_sale', 'walkin_member_sale'].includes(r.customer_type)).reduce((s, r) => s + Number(r.total_revenue || 0), 0);

    const receiptTypes = new Set(['received', 'receive', 'stock_receipt']);
    const dispenseTypes = new Set(['dispense', 'sale', 'walkin', 'walkin_non_member_sale', 'walkin_member_sale']);
    const receiptUnits = movAgg.filter((m) => receiptTypes.has(m.movement_type)).reduce((s, m) => s + Number(m.total_qty || 0), 0);
    const dispenseUnits = movAgg.filter((m) => dispenseTypes.has(m.movement_type)).reduce((s, m) => s + Number(m.total_qty || 0), 0);

    res.status(200).json({
      success: true,
      freshness: liveFreshness(),
      cost_basis: 'received_batches_v1',
      period: { from, to },
      inventory: {
        warehouseQty,
        warehouseCIF: parseFloat(warehouseCIF.toFixed(2)),
        warehouseDPC: parseFloat(warehouseDPC.toFixed(2)),
        branchQty,
        branchDPC: parseFloat(branchDPC.toFixed(2)),
        totalQty: stock.reduce((sum, r) => sum + r.qty, 0),
        totalValueDPC: Number(stock.reduce((sum, r) => sum + r.qty * (r.unitDPC ?? 0), 0).toFixed(2)),
        totalValueCIF: Number(stock.reduce((sum, r) => sum + r.qty * (r.unitCIF ?? 0), 0).toFixed(2)),
        missingCostQuantity: stock.reduce((sum, r) => sum + r.missingCostQuantity, 0),
        missingDPCQuantity: stock.reduce((sum, r) => sum + r.missingDPCQuantity, 0),
        availableQty: stock.reduce((sum, r) => sum + r.availableQty, 0), reservedQty: stock.reduce((sum, r) => sum + r.reservedQty, 0),
        inTransitQty: stock.reduce((sum, r) => sum + r.inTransitQty, 0),
        valuationComplete: stock.every((r) => !r.missingCostQuantity && !r.missingDPCQuantity)
      },
      sales: {
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        transactionCount,
        memberRevenue: parseFloat(memberRevenue.toFixed(2)),
        nonMemberRevenue: parseFloat(nonMemberRevenue.toFixed(2))
      },
      movements: {
        receiptUnits,
        dispenseUnits
      }
    });
  } catch (err) {
    console.error('Stock reports summary error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
