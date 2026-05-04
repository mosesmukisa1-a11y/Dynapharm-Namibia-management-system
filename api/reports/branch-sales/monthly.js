import { applyAuthCors } from '../../_lib/auth.js';
import { getMany, getOne } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const branchId = url.searchParams.get('branch_id') || '';
    const monthParam = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);

    const [year, month] = monthParam.split('-').map(Number);
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const conds = [`service_date >= $1 AND service_date < $2`];
    const params = [monthStart, nextMonth];
    if (branchId && branchId !== 'all') {
      conds.push(`branch_id = $${params.length + 1}`);
      params.push(branchId);
    }

    const normBranchId = branchId && branchId !== 'all'
      ? branchId.toLowerCase().replace(/ /g, '_')
      : null;

    const movConds = [`created_at >= $1 AND created_at < $2`];
    const movParams = [monthStart, nextMonth];
    if (normBranchId) {
      movConds.push(`LOWER(REPLACE(branch_id, ' ', '_')) = $${movParams.length + 1}`);
      movParams.push(normBranchId);
    }

    // Supplement params: reports table uses branch name (may be plain or prefixed)
    const rpParams = [monthStart, nextMonth];
    const rpBranchClause = normBranchId
      ? ` AND LOWER(REPLACE(COALESCE(NULLIF(TRIM(r.branch),''),'townshop'),' ','_')) = $${rpParams.push(normBranchId) && rpParams.length}`
      : '';

    const [txRows, rxProductMovements, walkinSalesRows, supplementReports, campaignMovements, refundMovements] = await Promise.all([
      getMany(
        `SELECT * FROM branch_activity_transactions WHERE ${conds.join(' AND ')} ORDER BY created_at ASC`,
        params
      ),
      getMany(
        `SELECT reference as form_reference_id, product_name, batch_no,
                SUM(ABS(quantity)) as qty,
                SUM(ABS(quantity) * COALESCE(unit_price, 0)) as dp_value
         FROM branch_inventory_movements
         WHERE ${movConds.join(' AND ')} AND type IN ('prescription_dispense','dispense','field_use')
         GROUP BY reference, product_name, batch_no`,
        movParams
      ),
      // POS walk-in sales from branch_walkin_sales (case-insensitive branch_id)
      getMany(
        `SELECT * FROM branch_walkin_sales
         WHERE sale_date >= $1 AND sale_date < $2${normBranchId ? ' AND LOWER(REPLACE(branch_id, \' \', \'_\')) = $3' : ''}
           AND (status IS NULL OR status NOT IN ('cancelled','voided'))
         ORDER BY created_at ASC`,
        normBranchId ? [monthStart, nextMonth, normBranchId] : [monthStart, nextMonth]
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
            WHERE bat.form_reference_id = r.id AND bat.activity_type = 'prescription_dispensing'
          )                                                                       AS rx_in_bat,
          EXISTS (
            SELECT 1 FROM branch_activity_transactions bat
            WHERE bat.form_reference_id = r.id AND bat.activity_type = 'consultation'
          )                                                                       AS consult_in_bat
        FROM reports r
        WHERE COALESCE(NULLIF(LEFT(TRIM(r.data->>'date'),10),''), DATE(r.created_at)::text)::date >= $1::date
          AND COALESCE(NULLIF(LEFT(TRIM(r.data->>'date'),10),''), DATE(r.created_at)::text)::date < $2::date
          ${rpBranchClause}
          AND (
            (r.data ? 'medicines' AND jsonb_array_length(COALESCE(r.data->'medicines','[]'::jsonb)) > 0)
            OR COALESCE((r.data->>'consultation_fee')::numeric, 0) > 0
          )
      `, rpParams),
      // Campaign sales from inventory movements — per-product rows for detail map
      getMany(
        `SELECT reference, branch_id, product_name, batch_no,
                SUM(ABS(quantity))                        AS total_qty,
                SUM(ABS(quantity) * COALESCE(unit_price, 0)) AS total_dp
         FROM branch_inventory_movements
         WHERE ${movConds.join(' AND ')} AND type = 'campaign_sale'
         GROUP BY reference, branch_id, product_name, batch_no`,
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

    // Merge POS walkin_sales into txRows (same deduplication as daily.js)
    const alreadyCapturedIds = new Set(
      txRows
        .filter(r => ['walkin_sale', 'member_sale', 'non_member_sale'].includes(r.activity_type))
        .flatMap(r => [r.form_reference_id, r.id].filter(Boolean))
    );
    const walkinSynthetic = walkinSalesRows
      .filter(s => !alreadyCapturedIds.has(s.id) && !alreadyCapturedIds.has(s.sale_number))
      .map(s => {
        let items = [];
        try { items = typeof s.items === 'string' ? JSON.parse(s.items) : (s.items || []); } catch {}
        const ct = (s.customer_type || 'walk_in').toLowerCase();
        const actType = ct === 'member' ? 'member_sale' : ct === 'non_member' ? 'non_member_sale' : 'walkin_sale';
        const totalQty = items.reduce((acc, i) => acc + Number(i.quantity || i.qty || 1), 0);
        const dpTotal = items.reduce((acc, i) =>
          acc + Number(i.dpPrice || i.dp || i.unit_price || 0) * Number(i.quantity || i.qty || 1), 0);
        const saleDateStr = s.sale_date instanceof Date
          ? s.sale_date.toISOString().slice(0, 10)
          : String(s.sale_date || '').slice(0, 10);
        return {
          id: s.id, branch_id: s.branch_id, activity_type: actType,
          service_date: saleDateStr, grand_total: Number(s.total || 0),
          product_total_dp: parseFloat(dpTotal.toFixed(2)),
          payment_method: s.payment_method || 'cash', payment_status: 'paid',
          total_qty: totalQty, consultation_fee: 0,
          client_name: s.customer_name || '', form_reference_id: s.id, _source: 'walkin_sales',
        };
      });

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

    // Build per-product map and per-reference aggregates from campaign movements.
    const campaignProductMap = {};
    const campaignRefAgg = {};
    for (const c of campaignMovements) {
      const ref = c.reference;
      if (!campaignProductMap[ref]) campaignProductMap[ref] = [];
      campaignProductMap[ref].push({
        product_name: c.product_name,
        batch_no: c.batch_no,
        qty: Number(c.total_qty || 0),
        dp_value: parseFloat(Number(c.total_dp || 0).toFixed(2)),
      });
      if (!campaignRefAgg[ref]) campaignRefAgg[ref] = { reference: ref, branch_id: c.branch_id, total_qty: 0, total_dp: 0 };
      campaignRefAgg[ref].total_qty += Number(c.total_qty || 0);
      campaignRefAgg[ref].total_dp  += Number(c.total_dp  || 0);
    }

    // Set of campaign sale reference IDs present in inventory movements.
    // Prevents double-counting with walkin_sales and BAT rows for the same campaign sale.
    const campaignRefIds = new Set(Object.keys(campaignRefAgg));

    // Campaign sales: one synthetic row per unique reference
    const campaignSynthetic = Object.values(campaignRefAgg).map(c => ({
      id: `camp-${c.reference}`,
      branch_id: c.branch_id,
      activity_type: 'campaign_sale',
      service_date: monthStart,
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

    // Merge: exclude campaign refs from txRows and walkinSynthetic to prevent double-counting.
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

    // For non-member sales, grand_total is the customer selling price (DP + distributor margin).
    // Use product_total_dp (item-level dp × qty) for those rows so all reports show true DP value.
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

    const pendingCapture = allTxRows.filter(r => r.reporting_status === 'pending').length;

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

    // Try to attach pre-computed stock snapshot for this month/branch
    let stockSnapshot = null;
    try {
      const snapshotId = branchId && branchId !== 'all'
        ? `monthly-${monthParam}-${(branchId).replace(/[^a-zA-Z0-9_]/g, '_')}`
        : `monthly-${monthParam}-all`;
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
      month: monthParam,
      month_start: monthStart,
      month_end: nextMonth,
      consultations: consultObj,
      walkin_sales: build(walkinRows),
      member_sales: build(memberRows),
      non_member_sales: build(nonMemberRows),
      online_order_sales: build(onlineRows),
      prescription_dispensing: buildRxWithDetail(rxRows),
      campaign_sales: buildCampaignWithDetail(campaignRows),
      refund_deductions: { count: refundCount, total_amount: refundTotal },
      pending_unposted_records: pendingCapture,
      grand_total: grandTotal,
      total_pending_value: totalPendingValue,
      total_transactions: txRows.length,
      total_qty_sold: sum(txRows, 'total_qty'),
      branch_summary: branchSummary,
    });
  } catch (err) {
    console.error('monthly branch sales report error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
