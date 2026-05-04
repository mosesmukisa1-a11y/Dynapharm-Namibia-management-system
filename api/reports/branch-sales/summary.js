/**
 * GET /api/reports/branch-sales/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Aggregates branch_activity_transactions by branch for a date range.
 * Also supplements with prescription revenue computed directly from the reports table
 * (for reports where captureRx was not yet called / branch was not yet stamped).
 */
import { getMany, query as dbQuery } from '../../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const from   = url.searchParams.get('from');
  const to     = url.searchParams.get('to');
  const branch = url.searchParams.get('branch') || null;

  if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

  try {
    // ── 1. Main BAT aggregation ──────────────────────────────────────────────
    const batParams = [from, to];
    const batBranchClause = branch ? `AND branch_id = $${batParams.push(branch)}` : '';
    // For non-member sales, grand_total is the customer selling price (DP + distributor margin).
    // We use product_total_dp (item-level DP × qty) for those rows to show true DP value,
    // matching the DP Sales Report and CSI Entry Report.
    const batRows = await getMany(
      `SELECT
         branch_id,
         COUNT(*)::int                                                    AS transactions,
         COALESCE(SUM(
           CASE WHEN activity_type IN ('non_member_sale','walkin_sale')
                THEN COALESCE(product_total_dp, grand_total)
                ELSE grand_total END
         ), 0)::numeric                                                   AS total_revenue,
         COUNT(DISTINCT service_date)::int                                AS days_active,
         COALESCE(SUM(CASE WHEN activity_type = 'member_sale'
                           THEN grand_total ELSE 0 END), 0)::numeric     AS member_total,
         COALESCE(SUM(CASE WHEN activity_type IN ('non_member_sale','walkin_sale')
                           THEN COALESCE(product_total_dp, grand_total)
                           ELSE 0 END), 0)::numeric                      AS non_member_total,
         COALESCE(SUM(CASE WHEN activity_type IN ('non_member_sale','walkin_sale')
                           THEN grand_total
                           ELSE 0 END), 0)::numeric                      AS non_member_cp_total,
         COALESCE(SUM(CASE WHEN activity_type = 'prescription_dispensing'
                           THEN grand_total ELSE 0 END), 0)::numeric     AS rx_total,
         COALESCE(SUM(CASE WHEN activity_type = 'consultation'
                           THEN grand_total ELSE 0 END), 0)::numeric     AS consult_total,
         COALESCE(SUM(CASE WHEN activity_type = 'walkin_sale'
                           THEN COALESCE(product_total_dp, grand_total)
                           ELSE 0 END), 0)::numeric                      AS walkin_total
       FROM branch_activity_transactions
       WHERE service_date >= $1 AND service_date <= $2 ${batBranchClause}
       GROUP BY branch_id
       ORDER BY total_revenue DESC`,
      batParams
    );

    // ── 2. Campaign sales from branch_inventory_movements ───────────────────
    const campParams = [from, to];
    const campBranchClause = branch
      ? `AND LOWER(REPLACE(branch_id, ' ', '_')) = LOWER(REPLACE($${campParams.push(branch)}, ' ', '_'))`
      : '';
    const campaignRows = await getMany(
      `SELECT
         branch_id,
         COUNT(DISTINCT reference)::int                                  AS campaign_transactions,
         COALESCE(SUM(ABS(quantity) * COALESCE(unit_price, 0)), 0)::numeric AS campaign_total
       FROM branch_inventory_movements
       WHERE type = 'campaign_sale'
         AND DATE(created_at) >= $1 AND DATE(created_at) <= $2
         ${campBranchClause}
       GROUP BY branch_id`,
      campParams
    );
    const campaignMap = {};
    for (const c of campaignRows) campaignMap[c.branch_id] = c;

    // ── 3. Prescription revenue from reports table ───────────────────────────
    // Picks up paid medicines on reports NOT already captured in BAT.
    // Uses the report's branch column if set; falls back to 'townshop' (HQ default).
    const rxParams = [from, to];
    const rxBranchClause = branch
      ? `AND COALESCE(NULLIF(TRIM(r.branch), ''), 'townshop') = $${rxParams.push(branch)}`
      : '';
    const rxSupplementRows = await getMany(
      `WITH paid_meds AS (
         SELECT
           r.id  AS report_id,
           DATE(r.created_at) AS service_date,
           COALESCE(NULLIF(TRIM(r.branch), ''), 'townshop') AS branch_id,
           r.data->>'membership_status' AS membership_status,
           COALESCE((m->>'quantity')::int, 1) AS qty,
           m->>'name' AS med_name
         FROM reports r
         CROSS JOIN jsonb_array_elements(r.data->'medicines') AS m
         WHERE r.data ? 'medicines'
           AND jsonb_array_length(r.data->'medicines') > 0
           AND (m->>'dispensed') = 'true'
           AND (m->>'paid') = 'true'
           AND DATE(r.created_at) >= $1
           AND DATE(r.created_at) <= $2
           ${rxBranchClause}
           AND NOT EXISTS (
             SELECT 1 FROM branch_activity_transactions bat
             WHERE bat.form_reference_id = r.id
               AND bat.activity_type = 'prescription_dispensing'
           )
       ),
       priced AS (
         SELECT
           pm.report_id,
           pm.service_date,
           pm.branch_id,
           pm.membership_status,
           pm.qty * COALESCE(
             (SELECT pp.cp FROM product_prices pp
              WHERE LOWER(TRIM(pp.description)) = LOWER(TRIM(pm.med_name)) LIMIT 1), 0
           ) AS line_cp
         FROM paid_meds pm
       ),
       report_totals AS (
         SELECT
           branch_id,
           report_id,
           membership_status,
           SUM(line_cp) AS rx_cp
         FROM priced
         GROUP BY branch_id, report_id, membership_status
       )
       SELECT
         branch_id,
         COUNT(DISTINCT report_id)::int                AS supplement_rx_count,
         COALESCE(SUM(rx_cp), 0)::numeric             AS supplement_rx_total,
         COALESCE(SUM(
           CASE WHEN membership_status = 'member' THEN 150 ELSE 200 END
         ), 0)::numeric                               AS supplement_consult_total
       FROM report_totals
       GROUP BY branch_id`,
      rxParams
    );

    // ── 3b. Refund deductions per branch ────────────────────────────────────
    const refParams = [from, to];
    const refBranchClause = branch
      ? `AND LOWER(REPLACE(branch_id, ' ', '_')) = LOWER(REPLACE($${refParams.push(branch)}, ' ', '_'))`
      : '';
    const refundRows = await getMany(
      `SELECT branch_id,
              COUNT(*)::int                                                         AS refund_count,
              COALESCE(SUM(ABS(quantity) * COALESCE(unit_price, 0)), 0)::numeric   AS refund_total
       FROM branch_inventory_movements
       WHERE type = 'refund_return'
         AND DATE(created_at) >= $1 AND DATE(created_at) <= $2
         ${refBranchClause}
       GROUP BY branch_id`,
      refParams
    );
    const refundMap = {};
    for (const r of refundRows) refundMap[r.branch_id?.toLowerCase()] = r;

    // ── 4. Merge campaign + supplement into BAT rows ─────────────────────────
    const supplementMap = {};
    for (const s of rxSupplementRows) {
      supplementMap[s.branch_id] = s;
    }

    const merged = batRows.map(row => {
      const s = supplementMap[row.branch_id];
      const camp = campaignMap[row.branch_id];
      const ref = refundMap[row.branch_id?.toLowerCase()];
      const campTotal  = parseFloat(camp?.campaign_total || 0);
      const campTx     = parseInt(camp?.campaign_transactions || 0);
      const rxTotal    = parseFloat(row.rx_total)     + parseFloat(s?.supplement_rx_total    || 0);
      const consultTotal = parseFloat(row.consult_total) + parseFloat(s?.supplement_consult_total || 0);
      const suppExtra  = parseFloat(s?.supplement_rx_total || 0) + parseFloat(s?.supplement_consult_total || 0);
      const refundTotal = parseFloat(ref?.refund_total || 0);
      return {
        ...row,
        rx_total:         rxTotal.toFixed(2),
        consult_total:    consultTotal.toFixed(2),
        campaign_total:   campTotal.toFixed(2),
        refund_deductions: refundTotal.toFixed(2),
        total_revenue:    (parseFloat(row.total_revenue) + suppExtra + campTotal - refundTotal).toFixed(2),
        transactions:     row.transactions + (s?.supplement_rx_count || 0) + campTx,
      };
    });

    // Add supplement rows for branches not yet in BAT at all
    const allBranchIds = new Set(batRows.map(r => r.branch_id));
    for (const s of rxSupplementRows) {
      if (!allBranchIds.has(s.branch_id)) {
        const camp = campaignMap[s.branch_id];
        const campTotal = parseFloat(camp?.campaign_total || 0);
        merged.push({
          branch_id:       s.branch_id,
          transactions:    s.supplement_rx_count + parseInt(camp?.campaign_transactions || 0),
          total_revenue:   (parseFloat(s.supplement_rx_total) + parseFloat(s.supplement_consult_total) + campTotal).toFixed(2),
          days_active:     1,
          member_total:    '0.00',
          non_member_total: '0.00',
          non_member_cp_total: '0.00',
          rx_total:        parseFloat(s.supplement_rx_total).toFixed(2),
          consult_total:   parseFloat(s.supplement_consult_total).toFixed(2),
          walkin_total:    '0.00',
          campaign_total:  campTotal.toFixed(2),
        });
        allBranchIds.add(s.branch_id);
      }
    }

    // Add campaign-only branches (not in BAT or supplement)
    for (const c of campaignRows) {
      if (!allBranchIds.has(c.branch_id)) {
        merged.push({
          branch_id:       c.branch_id,
          transactions:    parseInt(c.campaign_transactions || 0),
          total_revenue:   parseFloat(c.campaign_total || 0).toFixed(2),
          days_active:     1,
          member_total:    '0.00',
          non_member_total: '0.00',
          non_member_cp_total: '0.00',
          rx_total:        '0.00',
          consult_total:   '0.00',
          walkin_total:    '0.00',
          campaign_total:  parseFloat(c.campaign_total || 0).toFixed(2),
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
