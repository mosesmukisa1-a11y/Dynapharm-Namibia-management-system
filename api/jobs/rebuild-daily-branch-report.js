import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { getMany, query } from '../db.js';
import { postActivityRecord, generateBatId } from '../_lib/activityCapture.js';

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => raw += c);
    req.on('end', () => {try {resolve(raw ? JSON.parse(raw) : {});} catch {reject(new Error('Invalid JSON'));}});
    req.on('error', reject);
  });
}

function classifySaleType(row) {
  const ct = (row.customer_type || '').toLowerCase();
  if (ct === 'member' || ct === 'walk_in_member_sale' || ct === 'walkin_member_sale') return 'member_sale';
  if (ct === 'non_member' || ct === 'walk_in_non_member_sale' || ct === 'walkin_non_member_sale') return 'non_member_sale';
  return 'walkin_sale';
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const body = await parseBody(req);
    const targetDate = body.date || new Date().toISOString().slice(0, 10);
    const branchId = body.branch_id || null;
    const dryRun = body.dry_run === true;

    const report = {
      date: targetDate,
      branch_id: branchId || 'all',
      posted: 0,
      skipped: 0,
      errors: [],
      orphans_detected: [],
      dry_run: dryRun
    };

    const alreadyPostedIds = new Set(
      (await __qd_executePlan(getMany, __qd_registeredPlan("api/jobs/rebuild-daily-branch-report.js:45:0", [
      branchId ? ' AND branch_id = $2' : '']),
      branchId ? [targetDate, branchId] : [targetDate])).
      map((r) => r.form_reference_id).filter(Boolean)
    );

    const salesConds = [__qd_registeredPlan("api/jobs/rebuild-daily-branch-report.js:50:1")];
    const salesParams = [targetDate];
    if (branchId) {salesConds.push(__qd_registeredPlan("api/jobs/rebuild-daily-branch-report.js:52:2", [salesParams.length + 1]));salesParams.push(branchId);}
    const walkinSales = await __qd_executePlan(getMany, __qd_registeredPlan("api/jobs/rebuild-daily-branch-report.js:54:3", [__qd_joinPlans(
      salesConds, "and")]),
    salesParams);


    for (const row of walkinSales) {
      const refId = row.id;
      if (alreadyPostedIds.has(refId)) {report.skipped++;continue;}
      if (dryRun) {report.orphans_detected.push({ type: 'walkin_sale', id: refId, branch: row.branch_id, total: row.total });continue;}

      const items = typeof row.items === 'string' ? JSON.parse(row.items || '[]') : row.items || [];
      const totalQty = items.reduce((s, i) => s + Number(i.quantity || i.qty || 0), 0);
      const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : row.metadata || {};
      const actType = classifySaleType(row);

      try {
        await postActivityRecord({
          id: generateBatId(),
          branch_id: row.branch_id || '',
          branch_name: row.branch_id || '',
          client_name: row.customer_name || 'Walk-in',
          client_phone: row.customer_phone || null,
          client_type: row.customer_type || 'walk_in',
          nb_number: meta.referralId || null,
          referral_nb: meta.referralId || null,
          service_date: row.sale_date,
          service_time: row.sale_date ? new Date(row.sale_date).toTimeString().slice(0, 8) : null,
          activity_type: actType,
          workflow_source: 'branch_portal',
          form_reference_id: refId,
          consultation_fee: 0,
          product_total_dp: Number(row.total || 0),
          product_total_cp: Number(row.total || 0),
          total_qty: totalQty,
          grand_total: Number(row.total || 0),
          payment_status: row.status === 'completed' ? 'paid' : 'pending',
          payment_method: row.payment_method || 'cash',
          stock_impact: true,
          stock_status: 'deducted',
          prescription_status: 'none',
          consultation_status: 'none',
          reporting_status: 'posted',
          captured_by: row.created_by || 'system_rebuild'
        });
        report.posted++;
      } catch (e) {
        report.errors.push({ id: refId, error: e.message });
      }
    }

    const movConds = [__qd_registeredPlan("api/jobs/rebuild-daily-branch-report.js:103:4"), __qd_registeredPlan("api/jobs/rebuild-daily-branch-report.js:103:5")];
    const movParams = [targetDate];
    if (branchId) {movConds.push(__qd_registeredPlan("api/jobs/rebuild-daily-branch-report.js:105:6", [movParams.length + 1]));movParams.push(branchId);}
    const rxMovements = await __qd_executePlan(getMany, __qd_registeredPlan("api/jobs/rebuild-daily-branch-report.js:107:7", [__qd_joinPlans(


      movConds, "and")]),
    movParams);


    const rxGrouped = {};
    for (const m of rxMovements) {
      const refId = m.reference_id || m.id;
      if (!rxGrouped[refId]) rxGrouped[refId] = { refId, branchId: m.source_location, items: [], qty: 0, createdAt: m.created_at };
      rxGrouped[refId].items.push(m);
      rxGrouped[refId].qty += Number(m.quantity || 0);
    }

    for (const [refId, rx] of Object.entries(rxGrouped)) {
      if (alreadyPostedIds.has(refId)) {report.skipped++;continue;}
      if (dryRun) {report.orphans_detected.push({ type: 'prescription_dispensing', id: refId, branch: rx.branchId, qty: rx.qty });continue;}

      try {
        await postActivityRecord({
          id: generateBatId(),
          branch_id: rx.branchId || '',
          branch_name: rx.branchId || '',
          client_name: 'Prescription Patient',
          service_date: rx.createdAt,
          activity_type: 'prescription_dispensing',
          workflow_source: 'branch_portal',
          form_reference_id: refId,
          total_qty: rx.qty,
          grand_total: 0,
          product_total_dp: 0,
          payment_status: 'paid',
          stock_impact: true,
          stock_status: 'deducted',
          prescription_status: 'dispensed',
          reporting_status: 'posted',
          captured_by: 'system_rebuild'
        });
        report.posted++;
      } catch (e) {
        report.errors.push({ id: refId, error: e.message });
      }
    }

    res.status(200).json({
      success: true,
      message: dryRun ? 'Dry run complete — no records written' : `Rebuild complete: ${report.posted} posted, ${report.skipped} already posted, ${report.errors.length} errors`,
      report
    });
  } catch (err) {
    console.error('rebuild-daily-branch-report error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
