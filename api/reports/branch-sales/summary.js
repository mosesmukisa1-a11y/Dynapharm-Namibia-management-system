/**
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
    const [batRows, batWalkinIds] = await Promise.all([
      getMany(
        `SELECT
           branch_id,
           COUNT(*)::int                                                    AS transactions,
           COALESCE(SUM(
             CASE WHEN activity_type IN ('non_member_sale','walkin_sale')
                  THEN COALESCE(product_total_dp, grand_total)
                  -- Non-member Rx: branch keeps DP; CP-DP margin goes to distributor
                  WHEN activity_type = 'prescription_dispensing' AND client_type != 'member'
                  THEN COALESCE(product_total_dp, grand_total)
                  -- Consultation fees are NOT DP product sales — excluded from total_revenue
                  WHEN activity_type = 'consultation' THEN 0
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
           -- rx_total: DP basis for non-member Rx (matches total_revenue logic).
           -- Member Rx: grand_total = DP (member pays DP). Non-member Rx: grand_total = CP
           -- (patient pays CP); use product_total_dp to get the true DP cost basis.
           COALESCE(SUM(CASE WHEN activity_type = 'prescription_dispensing'
                             THEN CASE WHEN client_type != 'member'
                                       THEN COALESCE(product_total_dp, grand_total)
                                       ELSE grand_total
                                  END
                             ELSE 0 END), 0)::numeric                      AS rx_total,
           -- Non-member Rx: separate CP and DP totals to compute distributor profit margin
           COALESCE(SUM(CASE WHEN activity_type = 'prescription_dispensing' AND client_type != 'member'
                             THEN grand_total ELSE 0 END), 0)::numeric     AS rx_nm_cp_total,
           COALESCE(SUM(CASE WHEN activity_type = 'prescription_dispensing' AND client_type != 'member'
                             THEN COALESCE(product_total_dp, grand_total) ELSE 0 END), 0)::numeric AS rx_nm_dp_total,
           COALESCE(SUM(CASE WHEN activity_type = 'consultation'
                             THEN grand_total ELSE 0 END), 0)::numeric     AS consult_total,
           COALESCE(SUM(CASE WHEN activity_type = 'walkin_sale'
                             THEN COALESCE(product_total_dp, grand_total)
                             ELSE 0 END), 0)::numeric                      AS walkin_total
         FROM branch_activity_transactions bat
         WHERE service_date >= $1 AND service_date <= $2 ${batBranchClause}
           -- Exclude campaign sale records: those are counted separately via
           -- branch_inventory_movements (campaign_sale type). Including them here
           -- AND in campaign_total would double-count the campaign DP amount.
           AND NOT EXISTS (
             SELECT 1 FROM branch_walkin_sales bws
             WHERE bws.id = bat.form_reference_id
               AND bws.data->>'sale_type' = 'campaign_sale'
           )
           -- Exclude prescription_dispensing dispense_draft rows entirely.
           -- dispense.js (workflow_source='branch_portal') is the authoritative record.
           -- capture-rx.js (dispense_draft) is an idempotency/summary record only.
           AND NOT (bat.activity_type = 'prescription_dispensing' AND bat.workflow_source = 'dispense_draft')
           -- Exclude consultation dispense_draft ONLY when a branch_portal consultation
           -- record also exists for the same report (prevents double-counting when
           -- capture-rx ran before dispense.js). Keep dispense_draft consultation rows
           -- when they are the sole record (consultation-only appointments).
           AND NOT (
             bat.activity_type = 'consultation' AND bat.workflow_source = 'dispense_draft'
             AND EXISTS (
               SELECT 1 FROM branch_activity_transactions b2
               WHERE b2.form_reference_id = bat.form_reference_id
                 AND b2.activity_type = 'consultation'
                 AND b2.workflow_source != 'dispense_draft'
             )
           )
         GROUP BY branch_id
         ORDER BY total_revenue DESC`,
        batParams
      ),
      // Fetch BAT IDs already capturing walk-in sales (to avoid double-counting)
      getMany(
        `SELECT form_reference_id, id FROM branch_activity_transactions
         WHERE service_date >= $1 AND service_date <= $2
           AND activity_type IN ('walkin_sale','member_sale','non_member_sale')
           ${branch ? `AND branch_id = $3` : ''}`,
        branch ? [from, to, branch] : [from, to]
      ),
    ]);

    // ── 1b. Supplement walk-in sales from branch_walkin_sales ────────────────
    // Matches the same logic as daily.js: pick up POS sales not yet posted to BAT.
    const alreadyCapturedWalkinIds = new Set(
      batWalkinIds.flatMap(r => [r.form_reference_id, r.id].filter(Boolean))
    );
    const normBranch = branch ? branch.toLowerCase().replace(/ /g, '_') : null;
    const wiSalesRows = await getMany(
      `SELECT id, sale_number, branch_id, customer_type, total, items, data
       FROM branch_walkin_sales
       WHERE sale_date::date >= $1 AND sale_date::date <= $2
         AND (status IS NULL OR status NOT IN ('cancelled','voided'))
         AND (data->>'sale_type' IS NULL OR data->>'sale_type' != 'campaign_sale')
         ${normBranch ? `AND LOWER(REPLACE(branch_id,' ','_')) = $3` : ''}`,
      normBranch ? [from, to, normBranch] : [from, to]
    );

    // Aggregate supplement walk-in DP by branch
    const walkinSupplementMap = {};
    for (const s of wiSalesRows) {
      if (alreadyCapturedWalkinIds.has(s.id) || alreadyCapturedWalkinIds.has(s.sale_number)) continue;
      let items = [];
      try { items = typeof s.items === 'string' ? JSON.parse(s.items) : (Array.isArray(s.items) ? s.items : []); } catch {}
      let saleData = {};
      try { saleData = typeof s.data === 'string' ? JSON.parse(s.data || '{}') : (s.data || {}); } catch {}
      const discountPct = Number(saleData.discount_pct || 0);
      const brId = s.branch_id || 'unknown';
      const ct   = (s.customer_type || '').toLowerCase();
      const isNonMember = ct.includes('non') || (!ct.includes('member') && ct !== 'online');
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
    const campBranchClause = branch
      ? `AND LOWER(REPLACE(bim.branch_id, ' ', '_')) = LOWER(REPLACE($${campParams.push(branch)}, ' ', '_'))`
      : '';
    // Reuse the same branch param ($3 if set) inside the sub-select
    const campSubBranchClause = branch
      ? `AND LOWER(REPLACE(branch_id, ' ', '_')) = LOWER(REPLACE($3, ' ', '_'))`
      : '';
    const campaignRows = await getMany(
      `SELECT
         bim.branch_id,
         -- Count distinct paid references only (free items share the same reference)
         COUNT(DISTINCT CASE WHEN bim.type != 'campaign_free_item' THEN bim.reference END)::int
                                                                         AS campaign_transactions,
         -- Sum DP value — mirrors daily-products.js logic exactly:
         --   campaign_free_item → 0 (free, no revenue)
         --   campaign_sale (member paid) → bim.unit_price (actual discounted DP) else pp.dp
         --   non-member walk_in discount campaign → pp.dp × (1 - discount_pct/100)
         --   non-member walk_in bxgy (no discount) → pp.dp ONLY (unit_price is CP for non-member)
         --   other types (generic 'sale') → pp.dp, then unit_price as fallback
         COALESCE(SUM(
           ABS(bim.quantity) *
           CASE WHEN bim.type = 'campaign_free_item' THEN 0
                WHEN bim.type = 'campaign_sale'
                  THEN COALESCE(NULLIF(bim.unit_price, 0), NULLIF(pp.dp, 0), 0)
                -- Non-member discount campaign: apply discount % to list DP.
                WHEN bim.type = 'walk_in_non_member_sale'
                      AND COALESCE(NULLIF((bws.data->>'discount_pct')::numeric, 0), 0) > 0
                  THEN COALESCE(
                    NULLIF(ROUND(pp.dp * (1 - (bws.data->>'discount_pct')::numeric / 100), 2), 0),
                    NULLIF(pp.dp, 0), 0)
                -- Non-member bxgy / missing discount_pct: list DP only.
                -- bim.unit_price stores the consumer price (CP) for non-member rows — never
                -- fall back to it or the campaign total will be inflated to a CP figure.
                WHEN bim.type = 'walk_in_non_member_sale'
                  THEN COALESCE(NULLIF(pp.dp, 0), 0)
                ELSE COALESCE(NULLIF(pp.dp, 0), NULLIF(bim.unit_price, 0), 0)
           END
         ), 0)::numeric                                                  AS campaign_total
       FROM branch_inventory_movements bim
       LEFT JOIN product_prices pp
              ON LOWER(TRIM(pp.description)) = LOWER(TRIM(bim.product_name))
       LEFT JOIN branch_walkin_sales bws ON bws.id = bim.reference
       WHERE (
           bim.type IN ('campaign_sale', 'campaign_free_item')
           OR (
             bim.type = 'walk_in_non_member_sale'
             AND bim.reference IN (
               SELECT id FROM branch_walkin_sales
               WHERE sale_date::date >= $1 AND sale_date::date <= $2
                 ${campSubBranchClause}
                 AND data->>'sale_type' = 'campaign_sale'
             )
           )
         )
         AND DATE(bim.created_at) >= $1 AND DATE(bim.created_at) <= $2
         ${campBranchClause}
       GROUP BY bim.branch_id`,
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
               AND bat.workflow_source != 'dispense_draft'
           )
       ),
       priced AS (
         SELECT
           pm.report_id,
           pm.service_date,
           pm.branch_id,
           pm.membership_status,
           pm.qty * COALESCE(
             (SELECT pp.dp FROM product_prices pp
              WHERE LOWER(TRIM(pp.description)) = LOWER(TRIM(pm.med_name)) LIMIT 1), 0
           ) AS line_dp
         FROM paid_meds pm
       ),
       report_totals AS (
         SELECT
           branch_id,
           report_id,
           membership_status,
           SUM(line_dp) AS rx_dp
         FROM priced
         GROUP BY branch_id, report_id, membership_status
       )
       SELECT
         branch_id,
         COUNT(DISTINCT report_id)::int                AS supplement_rx_count,
         COALESCE(SUM(rx_dp), 0)::numeric             AS supplement_rx_total,
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
      `SELECT bim.branch_id,
              COUNT(*)::int AS refund_count,
              COALESCE(SUM(
                ABS(bim.quantity) *
                -- Use bim.unit_price first: it stores the ACTUAL refunded (campaign) price.
                -- Fall back to pp.dp only when bim.unit_price is 0/null (legacy entries).
                COALESCE(bim.charge_unit, NULLIF(bim.unit_price, 0), NULLIF(pp.dp, 0), 0)
              ), 0)::numeric AS refund_total
       FROM branch_inventory_movements bim
       LEFT JOIN product_prices pp
              ON LOWER(TRIM(pp.description)) = LOWER(TRIM(bim.product_name))
       WHERE bim.type = 'refund_return'
         AND DATE(bim.created_at) >= $1 AND DATE(bim.created_at) <= $2
         ${refBranchClause.replace(/branch_id/g, 'bim.branch_id')}
       GROUP BY bim.branch_id`,
      refParams
    );
    const refundMap = {};
    for (const r of refundRows) refundMap[r.branch_id?.toLowerCase()] = r;

    // ── 3c. BIM-based walk-in DP ─────────────────────────────────────────────
    // Authoritative source for walk-in DP — identical logic to daily-products.js.
    // Replaces BAT member_total/non_member_total as the walk-in figure so both
    // the Sales Review and the Product Sales Report always agree.
    const bimWiParams = [from, to];
    const bimWiBranchClause = branch
      ? `AND LOWER(REPLACE(bim.branch_id,' ','_'))=LOWER(REPLACE($${bimWiParams.push(branch)},' ','_'))`
      : '';
    const bimWiSubClause = branch
      ? `AND LOWER(REPLACE(branch_id,' ','_'))=LOWER(REPLACE($3,' ','_'))`
      : '';
    const bimWalkinRows = await getMany(
      `SELECT
         bim.branch_id,
         -- total walk-in DP (member + non-member, discount applied where applicable)
         SUM(
           ABS(bim.quantity) *
           CASE
             WHEN bim.type='walk_in_non_member_sale' AND COALESCE(cr.discount_pct,0)>0
               THEN COALESCE(NULLIF(ROUND(pp.dp*(1-cr.discount_pct/100),2),0),NULLIF(pp.dp,0),0)
             WHEN bim.type='walk_in_non_member_sale'
               THEN COALESCE(NULLIF(pp.dp,0),0)
             ELSE COALESCE(NULLIF(pp.dp,0),NULLIF(bim.unit_price,0),0)
           END
         ) AS walkin_dp,
         -- member portion (walk_in_member_sale + generic 'sale')
         SUM(CASE WHEN bim.type IN ('walk_in_member_sale','sale')
               THEN ABS(bim.quantity)*COALESCE(NULLIF(pp.dp,0),NULLIF(bim.unit_price,0),0)
               ELSE 0 END) AS member_dp,
         -- non-member portion (walk_in_non_member_sale, discount applied)
         SUM(CASE WHEN bim.type='walk_in_non_member_sale'
               THEN ABS(bim.quantity)*COALESCE(
                 CASE WHEN COALESCE(cr.discount_pct,0)>0
                   THEN NULLIF(ROUND(pp.dp*(1-cr.discount_pct/100),2),0)
                   ELSE NULLIF(pp.dp,0) END, 0)
               ELSE 0 END) AS non_member_dp
       FROM branch_inventory_movements bim
       LEFT JOIN product_prices pp
              ON LOWER(TRIM(pp.description))=LOWER(TRIM(bim.product_name))
       LEFT JOIN (
         SELECT id, (data->>'discount_pct')::numeric AS discount_pct
         FROM branch_walkin_sales
         WHERE sale_date::date >= $1 AND sale_date::date <= $2
           ${bimWiSubClause}
           AND data->>'sale_type'='campaign_sale'
       ) cr ON cr.id=bim.reference
       WHERE DATE(bim.created_at) >= $1 AND DATE(bim.created_at) <= $2
         AND bim.type IN ('walk_in_member_sale','walk_in_non_member_sale','sale')
         -- campaign non-member walk-ins are already in campaign_total; exclude them here
         AND NOT (bim.type='walk_in_non_member_sale' AND cr.id IS NOT NULL)
         ${bimWiBranchClause}
       GROUP BY bim.branch_id`,
      bimWiParams
    );
    const bimWalkinMap = {};
    for (const r of bimWalkinRows) bimWalkinMap[r.branch_id?.toLowerCase()] = r;

    // ── 4. Merge all sources into BAT rows ───────────────────────────────────
    const supplementMap = {};
    for (const s of rxSupplementRows) supplementMap[s.branch_id] = s;

    const merged = batRows.map(row => {
      const s    = supplementMap[row.branch_id];
      const camp = campaignMap[row.branch_id];
      const ref  = refundMap[row.branch_id?.toLowerCase()];
      const wi   = walkinSupplementMap[row.branch_id] || walkinSupplementMap[row.branch_id?.toLowerCase()] || {};
      // BIM-based walk-in: authoritative source matching the Product Sales Report
      const bimWi = bimWalkinMap[row.branch_id?.toLowerCase()] || {};

      const campTotal    = parseFloat(camp?.campaign_total || 0);
      const campTx       = parseInt(camp?.campaign_transactions || 0);
      const rxTotal      = parseFloat(row.rx_total)    + parseFloat(s?.supplement_rx_total    || 0);
      const consultTotal = parseFloat(row.consult_total)+ parseFloat(s?.supplement_consult_total || 0);
      // suppExtra: only Rx supplement — consultation fees are NOT part of DP sales total
      const suppExtra    = parseFloat(s?.supplement_rx_total || 0);
      const refundTotal  = parseFloat(ref?.refund_total || 0);
      // BIM walk-in DP totals (same source as Product Sales Report)
      const bimMemberDp    = parseFloat(bimWi.member_dp    || 0);
      const bimNonMemberDp = parseFloat(bimWi.non_member_dp|| 0);
      const wiTx           = parseInt(wi.transactions || 0);
      // Rx non-member distributor profit: CP-DP margin from prescription dispensing
      const rxNmCpTotal  = parseFloat(row.rx_nm_cp_total || 0);
      const rxNmDpTotal  = parseFloat(row.rx_nm_dp_total || 0);
      const rxDistributorProfit = parseFloat(Math.max(0, rxNmCpTotal - rxNmDpTotal).toFixed(2));

      return {
        ...row,
        // Use BIM-sourced walk-in DP so Sales Review matches Product Report exactly
        member_total:         bimMemberDp.toFixed(2),
        non_member_total:     bimNonMemberDp.toFixed(2),
        rx_total:             rxTotal.toFixed(2),
        rx_nm_cp_total:       rxNmCpTotal.toFixed(2),
        rx_nm_dp_total:       rxNmDpTotal.toFixed(2),
        rx_distributor_profit: rxDistributorProfit.toFixed(2),
        consult_total:        consultTotal.toFixed(2),
        campaign_total:       campTotal.toFixed(2),
        refund_deductions:    refundTotal.toFixed(2),
        // total_revenue: BIM walk-in + BAT rx (+ supplement) + BIM campaign – BIM refunds
        total_revenue:        (bimMemberDp + bimNonMemberDp + rxTotal + campTotal - refundTotal).toFixed(2),
        transactions:         row.transactions + (s?.supplement_rx_count || 0) + campTx + wiTx,
      };
    });

    // Add supplement rows for branches not yet in BAT at all
    const allBranchIds = new Set(batRows.map(r => r.branch_id));

    // Walk-in-only or BIM-only branches (not in BAT)
    // Combine walkinSupplementMap keys and bimWalkinMap keys so no branch is missed
    const noBATPossibleBranches = new Set([
      ...Object.keys(walkinSupplementMap),
      ...Object.keys(bimWalkinMap),
    ]);
    for (const brId of noBATPossibleBranches) {
      if (allBranchIds.has(brId)) continue;
      const camp      = campaignMap[brId];
      const campTotal = parseFloat(camp?.campaign_total || 0);
      const s         = supplementMap[brId];
      const suppExtra = parseFloat(s?.supplement_rx_total || 0);
      const ref       = refundMap[brId?.toLowerCase()];
      const refundTotal = parseFloat(ref?.refund_total || 0);
      const wi        = walkinSupplementMap[brId] || {};
      const bimWi     = bimWalkinMap[brId] || {};
      // BIM is authoritative for walk-in DP; fall back to branch_walkin_sales supplement
      const bimMemberDp    = parseFloat(bimWi.member_dp    || 0);
      const bimNonMemberDp = parseFloat(bimWi.non_member_dp|| 0);
      const wiDp = bimMemberDp + bimNonMemberDp ||
                   parseFloat(wi.member_dp || 0) + parseFloat(wi.non_member_dp || 0);
      merged.push({
        branch_id:          brId,
        transactions:       (wi.transactions || 0) + parseInt(camp?.campaign_transactions || 0) + (s?.supplement_rx_count || 0),
        total_revenue:      (wiDp + campTotal + suppExtra - refundTotal).toFixed(2),
        days_active:        1,
        member_total:       bimMemberDp > 0 ? bimMemberDp.toFixed(2) : parseFloat(wi.member_dp    || 0).toFixed(2),
        non_member_total:   bimNonMemberDp > 0 ? bimNonMemberDp.toFixed(2) : parseFloat(wi.non_member_dp|| 0).toFixed(2),
        non_member_cp_total:'0.00',
        rx_total:           parseFloat(s?.supplement_rx_total    || 0).toFixed(2),
        consult_total:      parseFloat(s?.supplement_consult_total || 0).toFixed(2),
        walkin_total:       wiDp.toFixed(2),
        campaign_total:     campTotal.toFixed(2),
        refund_deductions:  refundTotal.toFixed(2),
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
          branch_id:       s.branch_id,
          transactions:    s.supplement_rx_count + parseInt(camp?.campaign_transactions || 0),
          total_revenue:   (parseFloat(s.supplement_rx_total) + campTotal - refundTotal).toFixed(2),
          days_active:     1,
          member_total:    '0.00',
          non_member_total: '0.00',
          non_member_cp_total: '0.00',
          rx_total:        parseFloat(s.supplement_rx_total).toFixed(2),
          consult_total:   parseFloat(s.supplement_consult_total).toFixed(2),
          walkin_total:    '0.00',
          campaign_total:  campTotal.toFixed(2),
          refund_deductions: refundTotal.toFixed(2),
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
          branch_id:       c.branch_id,
          transactions:    parseInt(c.campaign_transactions || 0),
          total_revenue:   (parseFloat(c.campaign_total || 0) - refundTotal).toFixed(2),
          days_active:     1,
          member_total:    '0.00',
          non_member_total: '0.00',
          non_member_cp_total: '0.00',
          rx_total:        '0.00',
          consult_total:   '0.00',
          walkin_total:    '0.00',
          campaign_total:  parseFloat(c.campaign_total || 0).toFixed(2),
          refund_deductions: refundTotal.toFixed(2),
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
