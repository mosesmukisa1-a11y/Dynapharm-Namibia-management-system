import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js"; /**
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
  oshakati: 'Oshakati',
  'hochland-park': 'Hochlandpark',
  hochland_park: 'Hochlandpark',
  walvisbay: 'Walvis Bay',
  walvis_bay: 'Walvis Bay',
  katima: 'Katima Mulilo',
  katima_mulilo: 'Katima Mulilo',
  katima_branch: 'Katima Mulilo',
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
  nkurenkuru: 'Nkurenkuru'
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
    nbNumber = null,
    referralNb = null
  } = req.body || {};

  if (!reportId || !branchId) {
    return res.status(400).json({ error: 'reportId and branchId are required' });
  }

  try {
    const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/capture-rx.js:60:0"),


    [reportId]);

    if (existing) {
      return res.json({ success: true, alreadyCaptured: true, id: existing.id });
    }

    const branchName = BRANCH_NAMES[branchId] || branchId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

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

    const isMember = customerType === 'member';
    const rxId = generateBatId();
    await __qd_executePlan(query, __qd_registeredPlan("api/branch/capture-rx.js:85:1"),














    [
    rxId, branchId, branchName, reportId,
    productTotalDp, totalQty, consultFee, grandTotal,
    paymentMethod, customerType || 'referred',
    isMember ? nbNumber || null : null,
    !isMember ? referralNb || null : null,
    capturedBy, date, time, now]);



    if (consultFee > 0) {
      const consultId = generateBatId();
      await __qd_executePlan(query, __qd_registeredPlan("api/branch/capture-rx.js:112:2"),














      [
      consultId, branchId, branchName, reportId,
      consultFee, paymentMethod,
      customerType || 'referred',
      isMember ? nbNumber || null : null,
      !isMember ? referralNb || null : null,
      capturedBy, date, time, now]);


    }

    return res.json({ success: true, id: rxId });
  } catch (err) {
    console.error('[capture-rx]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
