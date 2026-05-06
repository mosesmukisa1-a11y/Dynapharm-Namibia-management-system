import { applyAuthCors } from '../../_lib/auth.js';
import { getMany, getOne } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const branchId = url.searchParams.get('branch_id') || '';
    const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);

    const conds = [`service_date = $1`];
    const params = [date];
    if (branchId && branchId !== 'all') {
      conds.push(`branch_id = $${params.length + 1}`);
      params.push(branchId);
    }

    const normBranchId = branchId && branchId !== 'all'
      ? branchId.toLowerCase().replace(/ /g, '_')
      : null;

    const movConds = [`DATE(created_at) = $1`];
    const movParams = [date];
    if (normBranchId) {
      movConds.push(`LOWER(REPLACE(branch_id, ' ', '_')) = $${movParams.length + 1}`);
      movParams.push(normBranchId);
    }

    // Supplement params: reports table uses branch name (may be plain or prefixed)
    const rpParams = [date];
    const rpBranchClause = normBranchId
      ? ` AND LOWER(REPLACE(COALESCE(NULLIF(TRIM(r.branch),''),'townshop'),' ','_')) = $${rpParams.push(normBranchId) && rpParams.length}`
      : '';

    const [txRows, visitRows, rxProductMovements, walkinSalesRows, supplementReports, campaignMovements, refundMovements] = await Promise.all([
      getMany(
        // Use alias `bat` so the NOT EXISTS self-join can correlate on form_reference_id.
        // Two dispense_draft exclusion rules:
        //   1. prescription_dispensing dispense_draft — always excluded. dispense.js
        //      (workflow_source='branch_portal') is the authoritative revenue record.
        //      capture-rx.js (dispense_draft) is an idempotency/summary record only.
        //   2. consultation dispense_draft — excluded ONLY when a branch_portal
        //      consultation BAT also exists for the same report (prevents double-counting
        //      when save ran before dispense). Kept when it is the sole record, i.e. for
        //      consultation-only appointments where dispense.js was never called.
        `SELECT bat.* FROM branch_activity_transactions bat WHERE ${conds.join(' AND ')}
           AND NOT (bat.activity_type = 'prescription_dispensing' AND bat.workflow_source = 'dispense_draft')
           AND NOT (
             bat.activity_type = 'consultation' AND bat.workflow_source = 'dispense_draft'
             AND EXISTS (
               SELECT 1 FROM branch_activity_transactions b2
               WHERE b2.form_reference_id = bat.form_reference_id
                 AND b2.activity_type = 'consultation'
                 AND b2.workflow_source != 'dispense_draft'
             )
           )
         ORDER BY bat.created_at ASC`,
        params
      ),
      getMany(
        `SELECT * FROM branch_client_visits WHERE checkin_time::date = $1${normBranchId ? ' AND LOWER(REPLACE(branch_id, \' \', \'_\')) = $2' : ''} ORDER BY checkin_time ASC`,
        normBranchId ? [date, normBranchId] : [date]
      ),
      getMany(
        `SELECT reference as form_reference_id,
                MIN(TRIM(product_name)) AS product_name,
                SUM(ABS(quantity)) as qty,
                SUM(ABS(quantity) * COALESCE(unit_price, 0)) as dp_value
         FROM branch_inventory_movements
         WHERE ${movConds.join(' AND ')} AND type IN ('prescription_dispense','dispense','field_use')
         GROUP BY reference, LOWER(TRIM(product_name))`,
        movParams
      ),
      // POS walk-in sales from branch_walkin_sales (case-insensitive branch_id match)
      getMany(
        `SELECT * FROM branch_walkin_sales
         WHERE sale_date::date = $1${normBranchId ? ' AND LOWER(REPLACE(branch_id, \' \', \'_\')) = $2' : ''}
           AND (status IS NULL OR status NOT IN ('cancelled','voided'))
         ORDER BY created_at ASC`,
        normBranchId ? [date, normBranchId] : [date]
      ),
      // Supplement: Consultant Portal reports not yet captured in BAT
      // Catches prescriptions/consultations where branch never clicked Dispense
      getMany(`
        SELECT
          r.id                                                                    AS report_id,
          COALESCE(NULLIF(LEFT(TRIM(r.data->>'date'),10),''), DATE(r.created_at)::text)
                                                                                 AS service_date,
          COALESCE(NULLIF(TRIM(r.branch),''), 'townshop')                        AS branch_id,
          COALESCE((r.data->>'consultation_fee')::numeric, 0)                    AS consultation_fee,
          COALESCE(r.data->>'payment_method', 'cash')                            AS payment_method,
          COALESCE(r.data->>'client_name', r.data->>'patient_name', 'Patient')   AS patient_name,
          COALESCE((
            SELECT SUM(
              COALESCE(
                CASE WHEN COALESCE((m->>'dp')::numeric, 0) > 0 THEN (m->>'dp')::numeric END,
                CASE WHEN COALESCE((m->>'dpPrice')::numeric, 0) > 0 THEN (m->>'dpPrice')::numeric END,
                (SELECT pp.dp FROM product_prices pp
                 WHERE LOWER(TRIM(pp.description)) = LOWER(TRIM(m->>'name')) LIMIT 1),
                0
              ) * COALESCE((m->>'quantity')::numeric, 1)
            )
            FROM jsonb_array_elements(COALESCE(r.data->'medicines','[]'::jsonb)) m
          ), 0)                                                                   AS rx_dp_total,
          COALESCE((
            SELECT SUM(COALESCE((m->>'quantity')::numeric, 1))
            FROM jsonb_array_elements(COALESCE(r.data->'medicines','[]'::jsonb)) m
          ), 0)                                                                   AS rx_qty,
          EXISTS (
            SELECT 1 FROM branch_activity_transactions bat
            WHERE bat.form_reference_id = r.id
              AND bat.activity_type = 'prescription_dispensing'
              AND bat.workflow_source != 'dispense_draft'
          )                                                                       AS rx_in_bat,
          EXISTS (
            SELECT 1 FROM branch_activity_transactions bat
            WHERE bat.form_reference_id = r.id
              AND bat.activity_type = 'consultation'
              AND bat.workflow_source != 'dispense_draft'
          )                                                                       AS consult_in_bat
        FROM reports r
        WHERE COALESCE(NULLIF(LEFT(TRIM(r.data->>'date'),10),''), DATE(r.created_at)::text)::date = $1::date
          ${rpBranchClause}
          AND (
            (r.data ? 'medicines' AND jsonb_array_length(COALESCE(r.data->'medicines','[]'::jsonb)) > 0)
            OR COALESCE((r.data->>'consultation_fee')::numeric, 0) > 0
          )
      `, rpParams),
      // Campaign sales from inventory movements — per-product rows for detail map.
      // Captures ALL three movement types that a campaign sale generates:
      //   campaign_sale        — member paid item
      //   walk_in_non_member_sale — non-member paid item (same saleId reference)
      //   campaign_free_item   — free item (unit_price = NULL → 0 DP, stock still deducted)
      // The subquery identifies campaign references via branch_walkin_sales.data->>'sale_type'.
      getMany(
        `SELECT reference, branch_id,
                MIN(TRIM(product_name)) AS product_name,
                type,
                SUM(ABS(quantity))                            AS total_qty,
                SUM(ABS(quantity) * COALESCE(unit_price, 0)) AS total_dp
         FROM branch_inventory_movements
         WHERE ${movConds.join(' AND ')}
           AND (
             type IN ('campaign_sale', 'campaign_free_item')
             OR (
               type = 'walk_in_non_member_sale'
               AND reference IN (
                 SELECT id FROM branch_walkin_sales
                 WHERE DATE(sale_date) = $1::date
                   ${normBranchId ? `AND LOWER(REPLACE(branch_id, ' ', '_')) = $2` : ''}
                   AND data->>'sale_type' = 'campaign_sale'
               )
             )
           )
         GROUP BY reference, branch_id, LOWER(TRIM(product_name)), type`,
        movParams
      ),
      // Approved refund return movements — deducted from sales totals
      getMany(
        `SELECT COUNT(*)::int AS refund_count,
                COALESCE(SUM(ABS(quantity) * COALESCE(unit_price, 0)), 0)::numeric AS refund_total
         FROM branch_inventory_movements
         WHERE ${movConds.join(' AND ')} AND type = 'refund_return'`,
        movParams
      ),
    ]);

    // IDs already captured via the old manual-capture flow in branch_activity_transactions
    const alreadyCapturedIds = new Set(
      txRows
        .filter(r => ['walkin_sale', 'member_sale', 'non_member_sale'].includes(r.activity_type))
        .flatMap(r => [r.form_reference_id, r.id].filter(Boolean))
    );

    // Map branch_walkin_sales rows to the same shape as branch_activity_transactions
    const walkinSynthetic = walkinSalesRows
      .filter(s => !alreadyCapturedIds.has(s.id) && !alreadyCapturedIds.has(s.sale_number))
      .map(s => {
        let items = [];
        try { items = typeof s.items === 'string' ? JSON.parse(s.items) : (s.items || []); } catch {}
        const ct = (s.customer_type || 'walk_in').toLowerCase();
        const actType = ct === 'member' ? 'member_sale'
          : ct === 'non_member' ? 'non_member_sale'
          : 'walkin_sale';
        const totalQty = items.reduce((acc, i) => acc + Number(i.quantity || i.qty || 1), 0);
        const dpTotal = items.reduce((acc, i) =>
          acc + Number(i.dpPrice || i.dp || i.unit_price || 0) * Number(i.quantity || i.qty || 1), 0);
        const saleDateStr = s.sale_date instanceof Date
          ? s.sale_date.toISOString().slice(0, 10)
          : String(s.sale_date || '').slice(0, 10);
        return {
          id: s.id,
          branch_id: s.branch_id,
          activity_type: actType,
          service_date: saleDateStr,
          grand_total: Number(s.total || 0),
          product_total_dp: parseFloat(dpTotal.toFixed(2)),
          payment_method: s.payment_method || 'cash',
          payment_status: 'paid',
          total_qty: totalQty,
          consultation_fee: 0,
          client_name: s.customer_name || '',
          form_reference_id: s.id,
          _source: 'walkin_sales',
        };
      });

    // Group per-product movements by form_reference_id for Rx detail lookup
    const rxProductMap = {};
    for (const m of rxProductMovements) {
      const ref = m.form_reference_id || 'unknown';
      if (!rxProductMap[ref]) rxProductMap[ref] = [];
      rxProductMap[ref].push({
        product_name: m.product_name,
        batch_no: m.batch_no,
        qty: Number(m.qty || 0),
        dp_value: parseFloat(Number(m.dp_value || 0).toFixed(2)),
      });
    }

    // Supplement: build synthetic BAT rows from reports not yet captured in BAT.
    // Rules:
    //   Prescription — only include if stock actually moved (inventory movement exists for
    //   this report_id). Use the actual dispensed amount from rxProductMap, NOT the full
    //   prescribed amount. Clients who didn't buy or only bought some medicines will
    //   therefore only contribute what was genuinely dispensed and paid.
    //   Consultation fee — only count fees that have a confirmed BAT entry (consult_in_bat).
    //   Without a BAT record we cannot verify the fee was actually collected, so we skip
    //   unconfirmed supplement consultations entirely.
    const reportSynthetic = [];
    for (const rpt of supplementReports) {
      const fee = Number(rpt.consultation_fee || 0);

      // Prescription dispensing: only include when actual inventory movements confirm
      // that medicines were dispensed and paid for.
      if (!rpt.rx_in_bat) {
        const actualProducts = rxProductMap[String(rpt.report_id)] || [];
        const actualDpTotal  = parseFloat(actualProducts.reduce((s, p) => s + Number(p.dp_value || 0), 0).toFixed(2));
        const actualQty      = actualProducts.reduce((s, p) => s + Number(p.qty || 0), 0);
        if (actualProducts.length > 0 && actualQty > 0) {
          reportSynthetic.push({
            id: `rpt-rx-${rpt.report_id}`,
            branch_id: branchId || rpt.branch_id,
            activity_type: 'prescription_dispensing',
            service_date: rpt.service_date,
            grand_total: actualDpTotal,
            product_total_dp: actualDpTotal,
            payment_method: rpt.payment_method || 'cash',
            payment_status: 'paid',
            total_qty: actualQty,
            consultation_fee: 0,
            client_name: rpt.patient_name || 'Patient',
            form_reference_id: rpt.report_id,
            _source: 'reports_supplement',
          });
        }
      }

      // Consultation fee: only count fees already confirmed in BAT (consult_in_bat = true).
      // Those rows come through txRows with their own payment_status from the database.
      // Supplement rows without a BAT entry cannot be verified as paid — skip them.
      void fee; // intentionally not counted here
    }

    // Build per-product aggregate for regular walk-in sales (member + non-member + general).
    // Campaign sales are excluded here — they appear separately in the campaign detail section.
    // Group by normalised key (UPPER+TRIM) so casing/spacing variants collapse into one row.
    const walkinProductAgg = {};
    for (const s of walkinSalesRows) {
      // Skip campaign sales — identified by data->>'sale_type' = 'campaign_sale'
      let sData = {};
      try { sData = typeof s.data === 'string' ? JSON.parse(s.data) : (s.data || {}); } catch {}
      if (sData.sale_type === 'campaign_sale') continue;

      let items = [];
      try { items = typeof s.items === 'string' ? JSON.parse(s.items) : (Array.isArray(s.items) ? s.items : []); } catch {}
      for (const item of items) {
        if (item.is_free) continue;  // free campaign items have no DP value
        const name = (item.product_name || item.name || item.description || '').trim();
        if (!name) continue;
        const key = name.toUpperCase();
        const qty = Number(item.quantity || item.qty || 0);
        const dp  = Number(item.dpPrice || item.dp || item.unit_price || 0);
        if (!walkinProductAgg[key]) walkinProductAgg[key] = { product_name: name, qty: 0, dp_value: 0, unit_dp: dp };
        walkinProductAgg[key].qty      += qty;
        walkinProductAgg[key].dp_value  = parseFloat((walkinProductAgg[key].dp_value + qty * dp).toFixed(2));
        if (dp > 0) walkinProductAgg[key].unit_dp = dp;
      }
    }
    const walkinProducts = Object.values(walkinProductAgg).sort((a, b) => b.dp_value - a.dp_value);

    // Build per-product map and per-reference aggregates from campaign movements.
    // Each campaign sale may span multiple product rows; aggregate into one synthetic row per reference.
    const campaignProductMap = {};
    const campaignRefAgg = {};
    for (const c of campaignMovements) {
      const ref    = c.reference;
      const isFree = c.type === 'campaign_free_item';
      if (!campaignProductMap[ref]) campaignProductMap[ref] = [];
      campaignProductMap[ref].push({
        product_name: c.product_name,
        qty:      Number(c.total_qty || 0),
        dp_value: parseFloat(Number(c.total_dp || 0).toFixed(2)),
        is_free:  isFree,   // free items have 0 dp_value but stock was still deducted
      });
      if (!campaignRefAgg[ref]) campaignRefAgg[ref] = { reference: ref, branch_id: c.branch_id, total_qty: 0, total_dp: 0 };
      campaignRefAgg[ref].total_qty += Number(c.total_qty || 0);
      // Free items carry 0 DP — don't double-count; unit_price is NULL in DB so total_dp is 0 anyway
      if (!isFree) campaignRefAgg[ref].total_dp += Number(c.total_dp || 0);
    }

    // Set of campaign sale reference IDs (= saleId) that exist in inventory movements.
    // Used to prevent double-counting: these sales are also inserted into branch_walkin_sales
    // and branch_activity_transactions as member_sale/non_member_sale — we exclude those
    // copies and use only the campaignSynthetic rows as the authoritative source.
    const campaignRefIds = new Set(Object.keys(campaignRefAgg));

    // Campaign sales: one synthetic row per unique reference (campaign sale)
    const campaignSynthetic = Object.values(campaignRefAgg).map(c => ({
      id: `camp-${c.reference}`,
      branch_id: c.branch_id,
      activity_type: 'campaign_sale',
      service_date: date,
      grand_total: parseFloat(Number(c.total_dp || 0).toFixed(2)),
      product_total_dp: parseFloat(Number(c.total_dp || 0).toFixed(2)),
      payment_method: 'cash',
      payment_status: 'paid',
      total_qty: Number(c.total_qty || 0),
      consultation_fee: 0,
      client_name: '',
      form_reference_id: c.reference,
      _source: 'campaign_movements',
    }));

    // Merge: exclude campaign refs from txRows and walkinSynthetic (same sale already in
    // campaignSynthetic), then add campaignSynthetic as the sole campaign source.
    const allTxRows = [
      ...txRows.filter(r => !campaignRefIds.has(r.form_reference_id)),
      ...walkinSynthetic.filter(s => !campaignRefIds.has(s.form_reference_id)),
      ...campaignSynthetic,
      ...reportSynthetic,
    ];

    const sum = (rows, field) => rows.reduce((s, r) => s + Number(r[field] || 0), 0);
    const paidRows = (rows) => rows.filter(r => r.payment_status === 'paid');
    const pendingRows = (rows) => rows.filter(r => r.payment_status !== 'paid');

    const consultRows = allTxRows.filter(r => ['consultation', 'full_body_checkup'].includes(r.activity_type));
    const walkinRows = allTxRows.filter(r => r.activity_type === 'walkin_sale');
    const memberRows = allTxRows.filter(r => r.activity_type === 'member_sale');
    const nonMemberRows = allTxRows.filter(r => r.activity_type === 'non_member_sale');
    const onlineRows = allTxRows.filter(r => r.activity_type === 'online_order');
    const rxRows = allTxRows.filter(r => r.activity_type === 'prescription_dispensing');
    const campaignRows = allTxRows.filter(r => r.activity_type === 'campaign_sale');

    // For a row, return the DP value: non-member sales sell at customer price > DP,
    // so we use product_total_dp (item-level dp × qty) for those rows.
    // Member sales, walk-in general, consultations, and Rx sell at DP, so grand_total is correct.
    const dpValue = (r) => r.activity_type === 'non_member_sale'
      ? Number(r.product_total_dp || 0)
      : Number(r.grand_total || 0);

    const buildPaymentBreakdown = (rows) => {
      const paymentMethods = {};
      for (const r of paidRows(rows)) {
        const pm = (r.payment_method || 'cash').toLowerCase();
        if (!paymentMethods[pm]) paymentMethods[pm] = { count: 0, value: 0 };
        paymentMethods[pm].count++;
        paymentMethods[pm].value = parseFloat((paymentMethods[pm].value + dpValue(r)).toFixed(2));
      }
      return paymentMethods;
    };

    const build = (rows) => ({
      transactions: rows.length,
      paid_count: paidRows(rows).length,
      pending_count: pendingRows(rows).length,
      qty: sum(rows, 'total_qty'),
      value: parseFloat(paidRows(rows).reduce((s, r) => s + dpValue(r), 0).toFixed(2)),
      pending_value: parseFloat(pendingRows(rows).reduce((s, r) => s + dpValue(r), 0).toFixed(2)),
      status: rows.length === 0 ? 'no_activity'
        : pendingRows(rows).length > 0 && paidRows(rows).length === 0 ? 'unpaid'
        : pendingRows(rows).length > 0 ? 'partial'
        : 'paid',
      payment_methods: buildPaymentBreakdown(rows),
    });

    const buildRxWithDetail = (rows) => {
      const base = build(rows);
      const line_items = rows.map(r => {
        const products = rxProductMap[r.form_reference_id] || [];
        return {
          reference_id: r.form_reference_id,
          client_name: r.client_name,
          client_type: r.client_type,
          date: r.service_date,
          total_qty: Number(r.total_qty || 0),
          total_dp_value: parseFloat(Number(r.product_total_dp || r.grand_total || 0).toFixed(2)),
          payment_method: r.payment_method || 'cash',
          payment_status: r.payment_status,
          products,
        };
      });
      return { ...base, line_items };
    };

    const buildCampaignWithDetail = (rows) => {
      const base = build(rows);
      const line_items = rows.map(r => {
        const products = campaignProductMap[r.form_reference_id] || [];
        return {
          reference_id: r.form_reference_id,
          date: r.service_date,
          total_qty: Number(r.total_qty || 0),
          total_dp_value: parseFloat(Number(r.grand_total || 0).toFixed(2)),
          payment_method: r.payment_method || 'cash',
          payment_status: r.payment_status,
          products,
        };
      });
      return { ...base, line_items };
    };

    const consultObj = {
      ...build(consultRows),
      fee_value: parseFloat(sum(paidRows(consultRows), 'consultation_fee').toFixed(2)),
      pending_fee_value: parseFloat(sum(pendingRows(consultRows), 'consultation_fee').toFixed(2)),
    };

    const sumDp = (rows) => rows.reduce((s, r) => s + dpValue(r), 0);

    const refundTotal = parseFloat(Number(refundMovements[0]?.refund_total || 0).toFixed(2));
    const refundCount = parseInt(refundMovements[0]?.refund_count || 0);

    const grandTotal = parseFloat((
      sumDp(paidRows(consultRows)) +
      sumDp(paidRows(walkinRows)) +
      sumDp(paidRows(memberRows)) +
      sumDp(paidRows(nonMemberRows)) +
      sumDp(paidRows(onlineRows)) +
      sumDp(paidRows(rxRows)) +
      sumDp(paidRows(campaignRows)) -
      refundTotal
    ).toFixed(2));

    const totalPendingValue = parseFloat((
      sumDp(pendingRows(consultRows)) +
      sumDp(pendingRows(walkinRows)) +
      sumDp(pendingRows(memberRows)) +
      sumDp(pendingRows(nonMemberRows)) +
      sumDp(pendingRows(onlineRows)) +
      sumDp(pendingRows(rxRows)) +
      sumDp(pendingRows(campaignRows))
    ).toFixed(2));

    const pendingCapture = txRows.filter(r => r.reporting_status === 'pending').length;

    const nmCpTotal = parseFloat(sum(paidRows(nonMemberRows), 'grand_total').toFixed(2));
    const nmDpTotal = parseFloat(sum(paidRows(nonMemberRows), 'product_total_dp').toFixed(2));
    const distributorProfit = parseFloat(Math.max(0, nmCpTotal - nmDpTotal).toFixed(2));
    const campaignDpTotal = parseFloat(sum(paidRows(campaignRows), 'grand_total').toFixed(2));
    const walkInRxSales = parseFloat((
      sum(paidRows(walkinRows), 'grand_total') +
      sum(paidRows(memberRows), 'grand_total') +
      nmCpTotal +
      sum(paidRows(rxRows), 'grand_total') +
      campaignDpTotal
    ).toFixed(2));
    const consultFeeTotal = consultObj.fee_value || 0;
    const branchSales = parseFloat((walkInRxSales - distributorProfit - consultFeeTotal - refundTotal).toFixed(2));
    const branchSummary = { walkin_rx_sales: walkInRxSales, distributor_profit: distributorProfit, consultation_fees: consultFeeTotal, refund_deductions: refundTotal, branch_sales: branchSales, nm_cp_total: nmCpTotal, nm_dp_total: nmDpTotal, campaign_total: campaignDpTotal };

    let stockSnapshot = null;
    try {
      const snapshotId = branchId && branchId !== 'all'
        ? `daily-${date}-${(branchId).replace(/[^a-zA-Z0-9_]/g, '_')}`
        : `daily-${date}-all`;
      const snapshotRow = await getOne(
        `SELECT report_data, computed_at FROM stock_report_summaries WHERE id = $1`,
        [snapshotId]
      ).catch(() => null);
      if (snapshotRow) {
        stockSnapshot = {
          source: 'precomputed',
          computed_at: snapshotRow.computed_at,
          data: typeof snapshotRow.report_data === 'string' ? JSON.parse(snapshotRow.report_data) : snapshotRow.report_data,
        };
      }
    } catch {}

    res.status(200).json({
      success: true,
      branch_id: branchId || 'all',
      date,
      stock_snapshot: stockSnapshot,
      client_visits: visitRows.length,
      client_visit_types: visitRows.reduce((acc, v) => { acc[v.visit_type] = (acc[v.visit_type] || 0) + 1; return acc; }, {}),
      consultations: consultObj,
      walkin_sales: build(walkinRows),
      member_sales: build(memberRows),
      non_member_sales: build(nonMemberRows),
      online_order_sales: build(onlineRows),
      prescription_dispensing: buildRxWithDetail(rxRows),
      campaign_sales: buildCampaignWithDetail(campaignRows),
      walkin_products: walkinProducts,
      refund_deductions: { count: refundCount, total_amount: refundTotal },
      pending_unposted_records: pendingCapture,
      grand_total: grandTotal,
      total_pending_value: totalPendingValue,
      total_transactions: allTxRows.length,
      total_qty_sold: sum(allTxRows, 'total_qty'),
      branch_summary: branchSummary,
    });
  } catch (err) {
    console.error('daily branch sales report error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
