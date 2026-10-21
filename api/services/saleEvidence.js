import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js";import { businessDay, BUSINESS_TIMEZONE } from './businessDates.js';
import { classifySaleCostEvidence } from '../../shared/saleCostEvidence.js';

export const saleEvidenceSchema = `
ALTER TABLE mis_sales_audit ADD COLUMN IF NOT EXISTS source_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS mis_sales_audit_source_key ON mis_sales_audit(source_key);
`;

const number = (value) => value == null || value === '' ? null : Number(value);
export const isSaleMovement = (type) => /sale|dispense|campaign_free_item|online_order_fulfilment/.test(type || '');

// Commercial DP is NOT received DPC/CIF. Unknown evidence must remain unknown.
export function movementSaleEvidence(row) {
  const evidence = row.metadata?.sale_evidence || {};
  const dp = number(evidence.dp_value);
  return {
    dp_unit_price: number(evidence.dp_unit_price), dp_value: dp,
    charged_unit_price: number(evidence.charged_unit_price),
    charged_value: number(evidence.charged_value),
    branch_profit_value: number(evidence.branch_profit_value),
    receipt_no: evidence.receipt_no || null,
    business_date: evidence.business_date || null,
    original_received_dpc: number(evidence.original_received_dpc),
    original_received_cost: number(evidence.original_received_cost),
    cost_evidence_status: classifySaleCostEvidence({
      originalReceivedDPC: evidence.original_received_dpc,
      originalReceivedCost: evidence.original_received_cost,
      zeroCostApproved: evidence.zero_cost_approved === true
    }),
    dp_complete: !isSaleMovement(row.movement_type || row.type) || dp != null,
    signed_quantity: isSaleMovement(row.movement_type || row.type) ?
    -Math.abs(Number(row.quantity)) : Number(row.quantity)
  };
}

export async function saveMovementSaleEvidenceTx(client, allocation, branchMovementId) {
  const s = allocation.snapshot,q = Number(allocation.quantity);
  const dp = number(s.financial_dp_unit),charge = number(s.revenue_unit);
  const charged = s.revenue_total != null ? Number(s.revenue_total) : charge == null ? null : charge * q;
  const evidence = { version: 1, sale_reference: allocation.sale_reference,
    movement_id: allocation.movement_id, branch_movement_id: branchMovementId || s.branch_movement_id || null,
    dp_unit_price: dp, dp_value: dp == null ? null : dp * q,
    charged_unit_price: charge, charged_value: charged,
    branch_profit_value: dp == null || charged == null ? null : charged - dp * q,
    original_received_dpc: number(s.unit_dp), original_received_cost: number(s.unit_cost),
    ...(s.campaign_pricing ? { campaign_pricing: s.campaign_pricing } : {}),
    zero_cost_approved: s.zeroCostApproved === true };
  // The exact mirror ID is captured at posting, never inferred by batch/name.
  const mirror = branchMovementId || s.branch_movement_id;
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidence.js:49:0"),
  [JSON.stringify(evidence), allocation.movement_id]);
  if (mirror) await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidence.js:51:1"),
  [JSON.stringify(evidence), mirror]);
}

export async function completeSaleEvidenceTx(client, { sourceKey, reference, receipt, branch, user,
  customerType, paymentMethod, chargedTotal, movementIds, timestamp, reconstructed = false }) {
  const rows = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidence.js:57:2"),


  [reference, movementIds || null])).rows;
  if (!rows.length) return null; // Non-stock fees are not stock sales.
  const instant = timestamp || rows[0].created_at;
  const lines = rows.map((a) => {
    const s = a.snapshot,q = Number(a.quantity),dp = number(s.financial_dp_unit);
    const charged = s.revenue_total != null ? Number(s.revenue_total) : s.revenue_unit == null ? null : Number(s.revenue_unit) * q;
    return { movementId: a.movement_id, productName: a.product_name, batchNo: a.batch_no,
      expiryDate: a.expiry_date, quantity: q, dpUnitPrice: dp, dpTotal: dp == null ? null : dp * q,
      chargedTotal: charged, branchProfit: dp == null || charged == null ? null : charged - dp * q,
      originalReceivedCost: s.unit_cost, originalReceivedDPC: s.unit_dp,
      ...(s.campaign_pricing ? { campaignPricing: s.campaign_pricing } : {}),
      costEvidenceStatus: classifySaleCostEvidence({ originalReceivedDPC: s.unit_dp,
        originalReceivedCost: s.unit_cost, zeroCostApproved: s.zeroCostApproved === true }) };
  });
  const sum = (field) => lines.some((l) => l[field] == null) ? null : lines.reduce((n, l) => n + l[field], 0);
  const details = { branch, reference, receiptNumber: receipt || reference,
    staffId: user?.id || user?.sub || null, staff: user?.fullName || user?.username || user?.id || user?.sub || null,
    customerType, paymentMethod, dpTotal: sum('dpTotal'), chargedTotal: chargedTotal ?? sum('chargedTotal'),
    allocatedChargedTotal: sum('chargedTotal'), branchProfitTotal: sum('branchProfit'),
    dpComplete: lines.every((l) => l.dpTotal != null), lines, businessDate: businessDay(new Date(instant)),
    timestamp: new Date(instant).toISOString(), timezone: BUSINESS_TIMEZONE,
    provenance: reconstructed ? 'reconstructed_exact_source' : 'transaction_capture' };
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidence.js:81:3"),

  [reference, details.staff, JSON.stringify(details), instant, sourceKey]);
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidence.js:84:4"),
  [JSON.stringify(details), reference]);
  for (const a of rows) {
    if (!reconstructed) await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidence.js:87:5"), [details.staff, a.movement_id]);
    await saveMovementSaleEvidenceTx(client, a);
    const patch = JSON.stringify({ receipt_no: receipt || reference, business_date: details.businessDate, timezone: BUSINESS_TIMEZONE });
    if (a.movement_id) await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidence.js:90:6"),
    [patch, a.movement_id, instant]);
    if (a.snapshot.branch_movement_id) await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidence.js:92:7"),
    [patch, a.snapshot.branch_movement_id, instant]);
  }
  return details;
}
