import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { query } from '../db.js';
import { businessDay, businessTime } from '../services/businessDates.js';
import { officialBranchName } from './branchUtils.js';

export function generateBatId() {
  return `BAT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function postActivityRecord(record) {
  const id = record.id || generateBatId();
  const now = new Date().toISOString();

  const serviceDate = /^\d{4}-\d{2}-\d{2}$/.test(record.service_date || '') ?
  record.service_date : businessDay(record.service_date ? new Date(record.service_date) : new Date());

  await __qd_executePlan(query, __qd_registeredPlan("api/_lib/activityCapture.js:17:0"),



















  [
  id,
  record.branch_id || '',
  officialBranchName(record.branch_id, record.branch_name || record.branch_id || ''),
  record.client_id || null,
  record.client_name || 'Walk-in Client',
  record.client_phone || null,
  record.client_type || 'walk_in',
  record.nb_number || null,
  record.referral_nb || null,
  serviceDate,
  record.service_time || businessTime(new Date(record.created_at || (
  String(record.service_date || '').includes('T') ? record.service_date : Date.now()))),
  record.activity_type || 'walkin_sale',
  record.workflow_source || 'branch_portal',
  record.form_reference_id || null,
  Number(record.consultation_fee || 0),
  record.product_total_dp === null ? null : Number(record.product_total_dp || 0),
  Number(record.product_total_cp || 0),
  Number(record.total_qty || 0),
  Number(record.grand_total || 0),
  record.payment_status || 'paid',
  record.payment_method || 'cash',
  record.stock_impact !== undefined ? record.stock_impact : false,
  record.stock_status || 'not_required',
  record.prescription_status || 'none',
  record.consultation_status || 'none',
  record.reporting_status || 'posted',
  record.captured_by || null,
  now,
  now]);


  return id;
}
