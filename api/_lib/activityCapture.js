import { query } from '../db.js';
import { businessDay, businessTime } from '../services/businessDates.js';

export function generateBatId() {
  return `BAT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function postActivityRecord(record) {
  const id = record.id || generateBatId();
  const now = new Date().toISOString();

  const serviceDate = /^\d{4}-\d{2}-\d{2}$/.test(record.service_date || '')
    ? record.service_date : businessDay(record.service_date ? new Date(record.service_date) : new Date());

  await query(
    `INSERT INTO branch_activity_transactions (
      id, branch_id, branch_name, client_id, client_name, client_phone,
      client_type, nb_number, referral_nb,
      service_date, service_time, activity_type, workflow_source, form_reference_id,
      consultation_fee, product_total_dp, product_total_cp, total_qty, grand_total,
      payment_status, payment_method, stock_impact, stock_status,
      prescription_status, consultation_status, reporting_status,
      captured_by, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,
      $10,$11,$12,$13,$14,
      $15,$16,$17,$18,$19,
      $20,$21,$22,$23,$24,$25,$26,$27,$28,$29
    )
    ON CONFLICT (id) DO UPDATE SET
      reporting_status = EXCLUDED.reporting_status,
      payment_status = EXCLUDED.payment_status,
      grand_total = EXCLUDED.grand_total,
      updated_at = EXCLUDED.updated_at`,
    [
      id,
      record.branch_id || '',
      record.branch_name || record.branch_id || '',
      record.client_id || null,
      record.client_name || 'Walk-in Client',
      record.client_phone || null,
      record.client_type || 'walk_in',
      record.nb_number || null,
      record.referral_nb || null,
      serviceDate,
      record.service_time || businessTime(new Date(record.created_at ||
        (String(record.service_date || '').includes('T') ? record.service_date : Date.now()))),
      record.activity_type || 'walkin_sale',
      record.workflow_source || 'branch_portal',
      record.form_reference_id || null,
      Number(record.consultation_fee || 0),
      record.product_total_dp===null ? null : Number(record.product_total_dp || 0),
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
      now,
    ]
  );
  return id;
}
