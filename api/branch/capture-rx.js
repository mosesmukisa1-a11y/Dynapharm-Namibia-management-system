/**
 * POST /api/branch/capture-rx
 * Lightweight prescription activity recorder — no stock deduction.
 * Used when staff save a completed prescription draft (all medicines dispensed + paid).
 * Idempotent: silently skips if the report was already captured.
 */
import { applyAuthCors } from '../_lib/auth.js';
import { query, getOne } from '../db.js';
import { generateBatId } from '../_lib/activityCapture.js';

const BRANCH_NAMES = {
  townshop: 'Windhoek CBD',
  oshakati_branch: 'Oshakati',
  'hochland-park': 'Hochlandpark',
  walvisbay: 'Walvis Bay',
  katima: 'Katima Mulilo',
  katima_mulilo: 'Katima Mulilo',
  tsumeb: 'Tsumeb',
  gobabis: 'Gobabis',
  swakopmund: 'Swakopmund',
  outapi: 'Outapi',
  okahao: 'Okahao',
  otjiwarongo: 'Otjiwarongo',
  eenhana: 'Eenhana',
  ondangwa: 'Ondangwa',
  rundu: 'Rundu',
  khomasdal: 'Khomasdal',
  okongo: 'Okongo',
  nkurenkuru: 'Nkurenkuru',
};

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    reportId,
    branchId,
    customerType,
    items = [],
    consultationFee = 0,
    capturedBy = '',
    serviceDate,
    paymentMethod = 'cash',
  } = req.body || {};

  if (!reportId || !branchId) {
    return res.status(400).json({ error: 'reportId and branchId are required' });
  }

  try {
    const existing = await getOne(
      `SELECT id FROM branch_activity_transactions
       WHERE form_reference_id = $1 AND activity_type = 'prescription_dispensing'`,
      [reportId]
    );
    if (existing) {
      return res.json({ success: true, alreadyCaptured: true, id: existing.id });
    }

    const branchName = BRANCH_NAMES[branchId] || branchId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const productTotalDp = items.reduce(
      (sum, i) => sum + (Number(i.unit_price) || 0) * (Number(i.quantity) || 1),
      0
    );
    const totalQty = items.reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);
    const consultFee = Number(consultationFee) || 0;
    const grandTotal = productTotalDp + consultFee;

    const now = new Date().toISOString();
    const date = serviceDate || now.slice(0, 10);
    const time = now.slice(11, 16);

    const rxId = generateBatId();
    await query(
      `INSERT INTO branch_activity_transactions
         (id, branch_id, branch_name, activity_type, workflow_source, form_reference_id,
          product_total_dp, product_total_cp, total_qty, consultation_fee, grand_total,
          payment_status, payment_method, stock_impact, stock_status, client_type,
          prescription_status, consultation_status, reporting_status,
          captured_by, service_date, service_time, created_at, updated_at)
       VALUES
         ($1,$2,$3,'prescription_dispensing','dispense_draft',$4,
          $5,$5,$6,$7,$8,
          'paid',$9,false,'no_change',$10,
          'completed','completed','captured',
          $11,$12,$13,$14,$14)`,
      [
        rxId, branchId, branchName, reportId,
        productTotalDp, totalQty, consultFee, grandTotal,
        paymentMethod, customerType || 'referred',
        capturedBy, date, time, now,
      ]
    );

    if (consultFee > 0) {
      const consultId = generateBatId();
      await query(
        `INSERT INTO branch_activity_transactions
           (id, branch_id, branch_name, activity_type, workflow_source, form_reference_id,
            consultation_fee, grand_total, payment_status, payment_method,
            stock_impact, stock_status, client_type,
            prescription_status, consultation_status, reporting_status,
            captured_by, service_date, service_time, created_at, updated_at)
         VALUES
           ($1,$2,$3,'consultation','dispense_draft',$4,
            $5,$5,'paid',$6,
            false,'no_change',$7,
            'n/a','completed','captured',
            $8,$9,$10,$11,$11)`,
      [
        consultId, branchId, branchName, reportId,
        consultFee, paymentMethod,
        customerType || 'referred',
        capturedBy, date, time, now,
      ]
      );
    }

    return res.json({ success: true, id: rxId });
  } catch (err) {
    console.error('[capture-rx]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
