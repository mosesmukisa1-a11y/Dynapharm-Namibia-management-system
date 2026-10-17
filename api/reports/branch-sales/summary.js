import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js"; /**
 * GET /api/reports/branch-sales/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Aggregates branch_activity_transactions by branch for a date range.
 * Also supplements with prescription revenue computed directly from the reports table
 * (for reports where captureRx was not yet called / branch was not yet stamped).
 */
import { getMany, query as dbQuery } from '../../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const branch = url.searchParams.get('branch') || null;

  if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

  try {
    // ── 1. Main BAT aggregation ──────────────────────────────────────────────
    const batParams = [from, to];
    const batBranchClause = branch ? __qd_registeredPlan("api/reports/branch-sales/summary.js:23:0", [batParams.push(branch)]) : __qd_registeredPlan("api/reports/branch-sales/summary.js:23:1");
    // For non-member sales, grand_total is the customer selling price (DP + distributor margin).
    // We use product_total_dp (item-level DP × qty) for those rows to show true DP value,
    // matching the DP Sales Report and CSI Entry Report.
    const [batRows, batWalkinIds] = await Promise.all([__qd_executePlan(
      getMany, __qd_registeredPlan("api/reports/branch-sales/summary.js:29:2", [










































      batBranchClause]),



























      batParams),

    // Fetch BAT IDs already capturing walk-in sales (to avoid double-counting)
    __qd_executePlan(getMany, __qd_registeredPlan("api/reports/branch-sales/summary.js:103:3", [



    branch ? `AND branch_id = $3` : '']),
    branch ? [from, to, branch] : [from, to])]

    );

    // ── 1b. Supplement walk-in sales from branch_walkin_sales ────────────────
    // Matches the same logic as daily.js: pick up POS sales not yet posted to BAT.
    const alreadyCapturedWalkinIds = new Set(
      batWalkinIds.flatMap((r) => [r.form_reference_id, r.id].filter(Boolean))
    );
    const normBranch = branch ? branch.toLowerCase().replace(/ /g, '_') : null;
    const wiSalesRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/reports/branch-sales/summary.js:118:4", [





    normBranch ? `AND LOWER(REPLACE(branch_id,' ','_')) = $3` : '']),
    normBranch ? [from, to, normBranch] : [from, to]);


    // Aggregate supplement walk-in DP by branch
    const walkinSupplementMap = {};
    for (const s of wiSalesRows) {
      if (alreadyCapturedWalkinIds.has(s.id) || alreadyCapturedWalkinIds.has(s.sale_number)) continue;
      let items = [];
      try {items = typeof s.items === 'string' ? JSON.parse(s.items) : Array.isArray(s.items) ? s.items : [];} catch {}
      let saleData = {};
      try {saleData = typeof s.data === 'string' ? JSON.parse(s.data || '{}') : s.data || {};} catch {}
      const discountPct = Number(saleData.discount_pct || 0);
      const brId = s.branch_id || 'unknown';
      const ct = (s.customer_type || '').toLowerCase();
      const isNonMember = ct.includes('non') || !ct.includes('member') && ct !== 'online';
      const dpTotal = items.reduce((acc, i) => {
        // Non-member walk-in: i.unit_price = consumer price (CP), never DP.
        // Only allow unit_price as a last-resort fallback for member/general sales.
        const dp = Number(i.dpPrice || i.dp || (isNonMember ? 0 : i.unit_price) || 0);
        const discountedDp = discountPct > 0 ? dp * (1 - discountPct / 100) : dp;
        return acc + discountedDp * Number(i.quantity || i.qty || 1);
      }, 0);
      if (!walkinSupplementMap[brId]) walkinSupplementMap[brId] = { transactions: 0, member_dp: 0, non_member_dp: 0 };
      walkinSupplementMap[brId].transactions++;
      if (ct === 'member') {
        walkinSupplementMap[brId].member_dp += dpTotal;
      } else {
        walkinSupplementMap[brId].non_member_dp += parseFloat(dpTotal.toFixed(2));
      }
    }

    // ── 2. Campaign sales from branch_inventory_movements ───────────────────
    // Captures all three movement types a campaign sale can generate:
    //   campaign_sale          — member paid item (unit_price = DP)
    //   walk_in_non_member_sale— non-member paid item (unit_price = DP, see campaign-sale.js)
    //   campaign_free_item     — free item (unit_price = NULL → 0 DP; excluded from sum)
    // References for non-member paid items are identified via branch_walkin_sales.data->>'sale_type'.
    const campParams = [from, to];
    const campBranchClause = branch ? __qd_registeredPlan("api/reports/branch-sales/summary.js:163:5", [
    campParams.push(branch)]) : __qd_registeredPlan("api/reports/branch-sales/summary.js:164:6");

    // Reuse the same branch param ($3 if set) inside the sub-select
    const campSubBranchClause = branch ?
    `AND LOWER(REPLACE(branch_id, ' ', '_')) = LOWER(REPLACE($3, ' ', '_'))` :
    '';
    const campaignRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/reports/branch-sales/summary.js:170:7", [









































    campSubBranchClause,





    campBranchClause]),

    campParams);

    const campaignMap = {};
    for (const c of campaignRows) campaignMap[c.branch_id] = c;

    // ── 3. Prescription revenue from reports table ───────────────────────────
    // Picks up paid medicines on reports NOT already captured in BAT.
    // Uses the report's branch column if set; falls back to 'townshop' (HQ default).
    const rxParams = [from, to];
    const rxBranchClause = branch ? __qd_registeredPlan("api/reports/branch-sales/summary.js:229:8", [
    rxParams.push(branch)]) : __qd_registeredPlan("api/reports/branch-sales/summary.js:230:9");

    const rxSupplementRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/reports/branch-sales/summary.js:232:10", [
















    rxBranchClause]),





































    rxParams);


    // ── 3b. Refund deductions per branch ────────────────────────────────────
    const refParams = [from, to];
    const refBranchClause = branch ? __qd_registeredPlan("api/reports/branch-sales/summary.js:292:11", [
    refParams.push(branch)]) : __qd_registeredPlan("api/reports/branch-sales/summary.js:293:12");

    const refundRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/reports/branch-sales/summary.js:295:13", [













    refBranchClause]),

    refParams);

    const refundMap = {};
    for (const r of refundRows) refundMap[r.branch_id?.toLowerCase()] = r;

    // ── 3c. BIM-based walk-in DP ─────────────────────────────────────────────
    // Authoritative source for walk-in DP — identical logic to daily-products.js.
    // Replaces BAT member_total/non_member_total as the walk-in figure so both
    // the Sales Review and the Product Sales Report always agree.
    const bimWiParams = [from, to];
    const bimWiBranchClause = branch ? __qd_registeredPlan("api/reports/branch-sales/summary.js:321:14", [
    bimWiParams.push(branch)]) : __qd_registeredPlan("api/reports/branch-sales/summary.js:322:15");

    const bimWiSubClause = branch ?
    `AND LOWER(REPLACE(branch_id,' ','_'))=LOWER(REPLACE($3,' ','_'))` :
    '';
    const bimWalkinRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/reports/branch-sales/summary.js:327:16", [































    bimWiSubClause,






    bimWiBranchClause]),

    bimWiParams);

    const bimWalkinMap = {};
    for (const r of bimWalkinRows) bimWalkinMap[r.branch_id?.toLowerCase()] = r;

    // ── 4. Merge all sources into BAT rows ───────────────────────────────────
    const supplementMap = {};
    for (const s of rxSupplementRows) supplementMap[s.branch_id] = s;

    const merged = batRows.map((row) => {
      const s = supplementMap[row.branch_id];
      const camp = campaignMap[row.branch_id];
      const ref = refundMap[row.branch_id?.toLowerCase()];
      const wi = walkinSupplementMap[row.branch_id] || walkinSupplementMap[row.branch_id?.toLowerCase()] || {};
      // BIM-based walk-in: authoritative source matching the Product Sales Report
      const bimWi = bimWalkinMap[row.branch_id?.toLowerCase()] || {};

      const campTotal = parseFloat(camp?.campaign_total || 0);
      const campTx = parseInt(camp?.campaign_transactions || 0);
      const rxTotal = parseFloat(row.rx_total) + parseFloat(s?.supplement_rx_total || 0);
      const consultTotal = parseFloat(row.consult_total) + parseFloat(s?.supplement_consult_total || 0);
      // suppExtra: only Rx supplement — consultation fees are NOT part of DP sales total
      const suppExtra = parseFloat(s?.supplement_rx_total || 0);
      const refundTotal = parseFloat(ref?.refund_total || 0);
      // BIM walk-in DP totals (same source as Product Sales Report)
      const bimMemberDp = parseFloat(bimWi.member_dp || 0);
      const bimNonMemberDp = parseFloat(bimWi.non_member_dp || 0);
      const wiTx = parseInt(wi.transactions || 0);
      // Rx non-member distributor profit: CP-DP margin from prescription dispensing
      const rxNmCpTotal = parseFloat(row.rx_nm_cp_total || 0);
      const rxNmDpTotal = parseFloat(row.rx_nm_dp_total || 0);
      const rxDistributorProfit = parseFloat(Math.max(0, rxNmCpTotal - rxNmDpTotal).toFixed(2));

      return {
        ...row,
        // Use BIM-sourced walk-in DP so Sales Review matches Product Report exactly
        member_total: bimMemberDp.toFixed(2),
        non_member_total: bimNonMemberDp.toFixed(2),
        rx_total: rxTotal.toFixed(2),
        rx_nm_cp_total: rxNmCpTotal.toFixed(2),
        rx_nm_dp_total: rxNmDpTotal.toFixed(2),
        rx_distributor_profit: rxDistributorProfit.toFixed(2),
        consult_total: consultTotal.toFixed(2),
        campaign_total: campTotal.toFixed(2),
        refund_deductions: refundTotal.toFixed(2),
        // total_revenue: BIM walk-in + BAT rx (+ supplement) + BIM campaign – BIM refunds
        total_revenue: (bimMemberDp + bimNonMemberDp + rxTotal + campTotal - refundTotal).toFixed(2),
        transactions: row.transactions + (s?.supplement_rx_count || 0) + campTx + wiTx
      };
    });

    // Add supplement rows for branches not yet in BAT at all
    const allBranchIds = new Set(batRows.map((r) => r.branch_id));

    // Walk-in-only or BIM-only branches (not in BAT)
    // Combine walkinSupplementMap keys and bimWalkinMap keys so no branch is missed
    const noBATPossibleBranches = new Set([
    ...Object.keys(walkinSupplementMap),
    ...Object.keys(bimWalkinMap)]
    );
    for (const brId of noBATPossibleBranches) {
      if (allBranchIds.has(brId)) continue;
      const camp = campaignMap[brId];
      const campTotal = parseFloat(camp?.campaign_total || 0);
      const s = supplementMap[brId];
      const suppExtra = parseFloat(s?.supplement_rx_total || 0);
      const ref = refundMap[brId?.toLowerCase()];
      const refundTotal = parseFloat(ref?.refund_total || 0);
      const wi = walkinSupplementMap[brId] || {};
      const bimWi = bimWalkinMap[brId] || {};
      // BIM is authoritative for walk-in DP; fall back to branch_walkin_sales supplement
      const bimMemberDp = parseFloat(bimWi.member_dp || 0);
      const bimNonMemberDp = parseFloat(bimWi.non_member_dp || 0);
      const wiDp = bimMemberDp + bimNonMemberDp ||
      parseFloat(wi.member_dp || 0) + parseFloat(wi.non_member_dp || 0);
      merged.push({
        branch_id: brId,
        transactions: (wi.transactions || 0) + parseInt(camp?.campaign_transactions || 0) + (s?.supplement_rx_count || 0),
        total_revenue: (wiDp + campTotal + suppExtra - refundTotal).toFixed(2),
        days_active: 1,
        member_total: bimMemberDp > 0 ? bimMemberDp.toFixed(2) : parseFloat(wi.member_dp || 0).toFixed(2),
        non_member_total: bimNonMemberDp > 0 ? bimNonMemberDp.toFixed(2) : parseFloat(wi.non_member_dp || 0).toFixed(2),
        non_member_cp_total: '0.00',
        rx_total: parseFloat(s?.supplement_rx_total || 0).toFixed(2),
        consult_total: parseFloat(s?.supplement_consult_total || 0).toFixed(2),
        walkin_total: wiDp.toFixed(2),
        campaign_total: campTotal.toFixed(2),
        refund_deductions: refundTotal.toFixed(2)
      });
      allBranchIds.add(brId);
    }

    for (const s of rxSupplementRows) {
      if (!allBranchIds.has(s.branch_id)) {
        const camp = campaignMap[s.branch_id];
        const campTotal = parseFloat(camp?.campaign_total || 0);
        const ref = refundMap[s.branch_id?.toLowerCase()];
        const refundTotal = parseFloat(ref?.refund_total || 0);
        merged.push({
          branch_id: s.branch_id,
          transactions: s.supplement_rx_count + parseInt(camp?.campaign_transactions || 0),
          total_revenue: (parseFloat(s.supplement_rx_total) + campTotal - refundTotal).toFixed(2),
          days_active: 1,
          member_total: '0.00',
          non_member_total: '0.00',
          non_member_cp_total: '0.00',
          rx_total: parseFloat(s.supplement_rx_total).toFixed(2),
          consult_total: parseFloat(s.supplement_consult_total).toFixed(2),
          walkin_total: '0.00',
          campaign_total: campTotal.toFixed(2),
          refund_deductions: refundTotal.toFixed(2)
        });
        allBranchIds.add(s.branch_id);
      }
    }

    // Add campaign-only branches (not in BAT, supplement, or walkin)
    for (const c of campaignRows) {
      if (!allBranchIds.has(c.branch_id)) {
        const ref = refundMap[c.branch_id?.toLowerCase()];
        const refundTotal = parseFloat(ref?.refund_total || 0);
        merged.push({
          branch_id: c.branch_id,
          transactions: parseInt(c.campaign_transactions || 0),
          total_revenue: (parseFloat(c.campaign_total || 0) - refundTotal).toFixed(2),
          days_active: 1,
          member_total: '0.00',
          non_member_total: '0.00',
          non_member_cp_total: '0.00',
          rx_total: '0.00',
          consult_total: '0.00',
          walkin_total: '0.00',
          campaign_total: parseFloat(c.campaign_total || 0).toFixed(2),
          refund_deductions: refundTotal.toFixed(2)
        });
        allBranchIds.add(c.branch_id);
      }
    }

    merged.sort((a, b) => parseFloat(b.total_revenue) - parseFloat(a.total_revenue));

    return res.json({ success: true, rows: merged, from, to });
  } catch (err) {
    console.error('[branch-sales/summary]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
