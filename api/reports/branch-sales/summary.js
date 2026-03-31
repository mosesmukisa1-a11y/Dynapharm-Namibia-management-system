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
    const batRows = await getMany(
      `SELECT
         branch_id,
         COUNT(*)::int                                                    AS transactions,
         COALESCE(SUM(grand_total), 0)::numeric                          AS total_revenue,
         COUNT(DISTINCT service_date)::int                                AS days_active,
         COALESCE(SUM(CASE WHEN activity_type = 'member_sale'            THEN grand_total ELSE 0 END), 0)::numeric AS member_total,
         COALESCE(SUM(CASE WHEN activity_type = 'non_member_sale'        THEN grand_total ELSE 0 END), 0)::numeric AS non_member_total,
         COALESCE(SUM(CASE WHEN activity_type = 'prescription_dispensing' THEN grand_total ELSE 0 END), 0)::numeric AS rx_total,
         COALESCE(SUM(CASE WHEN activity_type = 'consultation'           THEN grand_total ELSE 0 END), 0)::numeric AS consult_total,
         COALESCE(SUM(CASE WHEN activity_type = 'walkin_sale'            THEN grand_total ELSE 0 END), 0)::numeric AS walkin_total
       FROM branch_activity_transactions
       WHERE service_date >= $1 AND service_date <= $2 ${batBranchClause}
       GROUP BY branch_id
       ORDER BY total_revenue DESC`,
      batParams
    );

    // ── 2. Prescription revenue from reports table ───────────────────────────
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

    // ── 3. Merge supplement into BAT rows ────────────────────────────────────
    const supplementMap = {};
    for (const s of rxSupplementRows) {
      supplementMap[s.branch_id] = s;
    }

    const merged = batRows.map(row => {
      const s = supplementMap[row.branch_id];
      if (!s) return row;
      const rxTotal      = parseFloat(row.rx_total)     + parseFloat(s.supplement_rx_total);
      const consultTotal = parseFloat(row.consult_total) + parseFloat(s.supplement_consult_total);
      return {
        ...row,
        rx_total:     rxTotal.toFixed(2),
        consult_total: consultTotal.toFixed(2),
        total_revenue: (parseFloat(row.total_revenue) + parseFloat(s.supplement_rx_total) + parseFloat(s.supplement_consult_total)).toFixed(2),
        transactions: row.transactions + s.supplement_rx_count,
      };
    });

    // Add supplement rows for branches not yet in BAT at all
    for (const s of rxSupplementRows) {
      if (!batRows.find(r => r.branch_id === s.branch_id)) {
        merged.push({
          branch_id:     s.branch_id,
          transactions:  s.supplement_rx_count,
          total_revenue: (parseFloat(s.supplement_rx_total) + parseFloat(s.supplement_consult_total)).toFixed(2),
          days_active:   1,
          member_total:  '0.00',
          non_member_total: '0.00',
          rx_total:      parseFloat(s.supplement_rx_total).toFixed(2),
          consult_total: parseFloat(s.supplement_consult_total).toFixed(2),
          walkin_total:  '0.00',
        });
      }
    }

    merged.sort((a, b) => parseFloat(b.total_revenue) - parseFloat(a.total_revenue));

    return res.json({ success: true, rows: merged, from, to });
  } catch (err) {
    console.error('[branch-sales/summary]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
