import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js";import { createHash, randomUUID } from 'node:crypto';
import { businessDay } from './businessDates.js';

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);return Number.isFinite(n) ? n : null;
};
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json = (value) => typeof value === 'string' ? JSON.parse(value) : value;

// Pure planner: source IDs, exact products and conserved quantities only.
// No catalogue, surviving-stock, staff-name or timestamp-proximity lookup.
export function planSaleEvidenceRepair({ sales, movements, allocations, audits, mirrors = [] }) {
  const eligible = [],review = [];
  for (const sale of sales) {
    const ms = movements.filter((m) => m.reference_id === sale.id);
    const as = allocations.filter((a) => a.sale_reference === sale.id);
    const items = json(sale.items) || [];
    const fail = (reason) => review.push({ reference: sale.id, receipt: sale.sale_number, reason });
    if (!sale.sale_date || !Number.isFinite(new Date(sale.sale_date).valueOf())) {
      fail('Missing valid original sale timestamp');continue;
    }
    if (!ms.length) {fail('Missing exact source-linked posted movements');continue;}
    if (ms.some((m) => m.source_location !== sale.branch_id)) {fail('Conflicting branch identity');continue;}
    if (!Array.isArray(items)) {fail('Original captured items are not an array');continue;}
    const lines = [];let reason;
    for (const m of ms) {
      const matches = as.filter((a) => a.movement_id === m.id);
      if (matches.length > 1) {reason = 'Multiple allocations claim the same movement';break;}
      const a = matches[0];
      if (a && (a.product_name !== m.product_name || Number(a.quantity) !== Math.abs(Number(m.quantity)) ||
      a.branch_id !== sale.branch_id)) {reason = 'Allocation conflicts with exact movement';break;}
      const source = items.filter((i) => (i.product_name || i.name || i.description) === m.product_name);
      const sourceQty = source.reduce((s, i) => s + Number(i.quantity ?? i.qty ?? 0), 0);
      const movedQty = ms.filter((row) => row.product_name === m.product_name).reduce((s, row) => s + Math.abs(Number(row.quantity)), 0);
      if (!source.length || !Number.isFinite(sourceQty) || sourceQty !== movedQty) {
        reason = 'Original captured product quantities do not match posted movements';break;
      }
      let dp = num(a?.snapshot?.financial_dp_unit);
      let charged = a?.snapshot?.revenue_total != null ? num(a.snapshot.revenue_total) :
      num(a?.snapshot?.revenue_unit) == null ? null : num(a.snapshot.revenue_unit) * Math.abs(Number(m.quantity));
      if (dp == null) {
        const units = new Set(source.map((i) => num(i.dpPrice ?? i.dp)));
        if (units.size !== 1 || units.has(null)) {
          reason = 'Missing or ambiguous original captured DP/quantity';break;
        }
        dp = [...units][0]; // Captured sale DP only, never received cost.
      }
      // A charged header cannot be distributed across products without original evidence.
      if (charged == null) {reason = 'Missing exact captured charged allocation';break;}
      const q = Math.abs(Number(m.quantity));
      if (!Number.isFinite(q) || q <= 0) {reason = 'Invalid captured movement quantity';break;}
      const candidate = { dp_unit_price: dp, dp_value: dp * q, charged_value: charged,
        charged_unit_price: charged / q, branch_profit_value: charged - dp * q,
        receipt_no: sale.sale_number || sale.id, business_date: businessDay(new Date(sale.sale_date)),
        timezone: 'Africa/Windhoek', sale_reference: sale.id, provenance: 'reconstructed_exact_source' };
      const original = m.metadata?.sale_evidence || {},patch = {};
      for (const [key, value] of Object.entries(candidate)) if (original[key] == null && value != null) patch[key] = value;
      if (Object.entries(candidate).some(([key, value]) => original[key] != null &&
      key !== 'provenance' && (typeof value === 'number' ?
      !Number.isFinite(Number(original[key])) || Math.abs(Number(original[key]) - value) > 1e-8 :
      original[key] !== value))) {
        reason = 'Existing nonblank evidence conflicts; manual review required';break;
      }
      const mirrorId = a?.snapshot?.branch_movement_id || null;
      const mirror = mirrors.find((row) => row.id === mirrorId);
      let mirrorPatch = null;
      if (mirrorId) {
        if (!mirror || mirror.branch_id !== sale.branch_id || mirror.reference !== sale.id ||
        mirror.product_name !== m.product_name || mirror.batch_no !== m.batch_no ||
        mirror.type !== m.movement_type || Math.abs(Number(mirror.quantity)) !== q) {
          reason = 'Captured branch mirror identity conflicts with original movement';break;
        }
        const saved = mirror.metadata?.sale_evidence || {};
        if (Object.entries(candidate).some(([key, value]) => saved[key] != null &&
        key !== 'provenance' && (typeof value === 'number' ?
        !Number.isFinite(Number(saved[key])) || Math.abs(Number(saved[key]) - value) > 1e-8 :
        saved[key] !== value))) {
          reason = 'Existing branch mirror evidence conflicts; manual review required';break;
        }
        mirrorPatch = Object.fromEntries(Object.entries(candidate).filter(([key]) => saved[key] == null));
      }
      lines.push({ movementId: m.id, mirrorId, mirrorPatch,
        allocationPatch: a && a.snapshot.financial_dp_unit == null ? { financial_dp_unit: dp } : null,
        productName: m.product_name, batchNo: m.batch_no, quantity: q, patch, dpTotal: dp * q, chargedTotal: charged });
      if (!a?.snapshot?.branch_movement_id) review.push({ reference: sale.id, movement: m.id,
        reason: 'Exact branch mirror identity was not captured; branch mirror repair requires original linkage' });
    }
    if (reason) {fail(reason);continue;}
    const audit = audits.find((a) => a.record_id === sale.id && a.event_type === 'sale_created');
    const dp = lines.reduce((n, l) => n + l.dpTotal, 0),charge = lines.reduce((n, l) => n + l.chargedTotal, 0);
    const details = { branch: sale.branch_id, reference: sale.id, receiptNumber: sale.sale_number || sale.id,
      staff: sale.created_by || null, staffId: null, customerType: sale.customer_type, paymentMethod: sale.payment_method,
      dpTotal: dp, chargedTotal: num(sale.total), allocatedChargedTotal: charge, branchProfitTotal: charge - dp,
      dpComplete: true, lines, businessDate: businessDay(new Date(sale.sale_date)),
      timestamp: new Date(sale.sale_date).toISOString(), timezone: 'Africa/Windhoek', provenance: 'reconstructed_exact_source' };
    if (lines.some((l) => Object.keys(l.patch).length || l.allocationPatch ||
    Object.keys(l.mirrorPatch || {}).length) || !audit)
    eligible.push({ reference: sale.id, branch: sale.branch_id, lines, audit: audit ? null : details });
  }
  // Legacy prescriptions have no exact completion-to-BAT identity. Never group
  // distinct partial issues by report name/time; they require operator review.
  for (const m of movements.filter((m) => !sales.some((s) => s.id === m.reference_id)))
  review.push({ reference: m.reference_id, movement: m.id, reason: 'No exact completed receipt/session source; review prescription/legacy evidence' });
  const plan = { eligible, review };
  return { ...plan, fingerprint: hash({ sales, movements, allocations, audits, mirrors }), planHash: hash(plan) };
}

// SELECT-only readiness check. Never create missing schema from the repair.
export async function readSaleRepairReadiness(client) {
  const row = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:111:0"), [])).










  rows[0];
  const blockers = [];
  if (!row.has_source_key) blockers.push('Missing mis_sales_audit.source_key');
  if (!row.has_source_key_unique) blockers.push('Missing valid unique audit source_key index');
  return { databaseFingerprint: hash({ database: row.database_name, oid: row.database_oid,
      server: row.server_address, port: row.server_port }), isPrimary: row.is_primary === true,
    schemaReady: blockers.length === 0, blockers };
}

export async function readSaleRepairPlan(client, { reference, branch, from, to, limit = 500 }) {
  const readiness = await readSaleRepairReadiness(client);
  const sales = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:133:1"),




  [reference || null, branch || null, from || null, to || null, limit + 1])).rows;
  if (sales.length > limit) throw Error('Repair scope exceeds limit; narrow the dates or exact reference');
  const refs = sales.map((s) => s.id);
  if (reference && !refs.includes(reference)) refs.push(reference);
  const movements = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:142:2"),




  [refs, reference ? null : branch, from || null, to || null])).rows;
  if (movements.length > 5000) throw Error('Too many movement rows; narrow repair scope');
  const allocations = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:149:3"), [movements.map((m) => m.id)])).rows;
  const audits = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:150:4"), [refs])).rows;
  const mirrors = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:151:5"),

  [allocations.map((a) => a.snapshot?.branch_movement_id).filter(Boolean)])).rows;
  const plan = planSaleEvidenceRepair({ sales, movements, allocations, audits, mirrors });
  if (reference && !sales.length && !movements.length) {
    plan.review.push({ reference, reason: 'No exact completed receipt or source-linked movement found' });
  }
  return { ...plan, readiness,
    fingerprint: hash({ sourceFingerprint: plan.fingerprint, databaseFingerprint: readiness.databaseFingerprint }),
    planHash: hash({ eligible: plan.eligible, review: plan.review, readiness }) };
}

export async function applySaleRepairPlanTx(client, plan) {
  const readiness = await readSaleRepairReadiness(client);
  if (!readiness.isPrimary || plan.readiness?.isPrimary !== true)
  throw Error('Repair requires a fresh reviewed dry run on the confirmed primary database; replica plans are not approval values');
  if (!readiness.schemaReady) throw Error(`Repair blocked: ${readiness.blockers.join('; ')}. Use the supported schema deployment process; no repair DDL is allowed.`);
  if (!plan.readiness || readiness.databaseFingerprint !== plan.readiness.databaseFingerprint)
  throw Error('Repair target differs from the reviewed database; run and review a new dry run');
  const refs = plan.eligible.map((s) => s.reference);
  const invariant = async () => hash((await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:171:6"),







  [refs])).rows);
  const before = await invariant();
  const repairEvents = [];
  const operationId = randomUUID();
  for (const sale of plan.eligible) {
    const evidenceLines = [];
    for (const line of sale.lines) {
      const movementBefore = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:187:7"),

      [line.movementId])).rows[0];
      if (!movementBefore) throw Error(`Repair source movement ${line.movementId} disappeared`);
      const allocationBefore = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:191:8"),

      [line.movementId])).rows[0] || null;
      const mirrorBefore = line.mirrorId ? (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:194:9"),

      [line.mirrorId])).rows[0] : null;
      if (line.mirrorId && !mirrorBefore) throw Error(`Repair source mirror ${line.mirrorId} disappeared`);
      if (line.allocationPatch) await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:197:10"),
      [JSON.stringify(line.allocationPatch), line.movementId]);
      // Each original field wins, including a valid zero. Never replace any
      // original nonblank evidence, even if the planner proposed a patch.
      if (line.movementId && line.patch && Object.keys(line.patch).length)
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:202:11"),

      [JSON.stringify(line.patch), line.movementId]);
      if (line.mirrorId && line.mirrorPatch && Object.keys(line.mirrorPatch).length)
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:206:12"),

      [JSON.stringify(line.mirrorPatch), line.mirrorId]);
      const movementAfter = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:210:13"),

      [line.movementId])).rows[0];
      const allocationAfter = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:213:14"),

      [line.movementId])).rows[0] || null;
      const mirrorAfter = line.mirrorId ? (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:216:15"),

      [line.mirrorId])).rows[0] : null;
      evidenceLines.push({
        movementId: line.movementId,
        branchMovementId: line.mirrorId || null,
        productName: line.productName,
        batchNo: line.batchNo,
        quantity: line.quantity,
        before: {
          movementSaleEvidence: movementBefore.evidence ?? null,
          allocationFinancialDpUnit: allocationBefore?.financial_dp_unit ?? null,
          branchMovementSaleEvidence: mirrorBefore?.evidence ?? null
        },
        after: {
          movementSaleEvidence: movementAfter?.evidence ?? null,
          allocationFinancialDpUnit: allocationAfter?.financial_dp_unit ?? null,
          branchMovementSaleEvidence: mirrorAfter?.evidence ?? null
        }
      });
    }
    if (sale.audit) await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:236:16"),

    [sale.reference, sale.audit.staff, JSON.stringify(sale.audit), sale.audit.timestamp, `walkin:${sale.reference}`]);
    const event = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/saleEvidenceRepair.js:239:17"),



    [sale.reference, JSON.stringify({
      executor: 'repair-sale-evidence CLI',
      operationId,
      planHash: plan.planHash,
      fingerprint: plan.fingerprint,
      sourceReference: sale.reference,
      branch: sale.branch,
      lines: evidenceLines
    }), `sale-evidence-repair:${operationId}:${sale.reference}`])).rows[0];
    if (event) repairEvents.push({ id: String(event.id), reference: sale.reference });
  }
  const after = await invariant();
  if (after !== before) throw Error('Repair invariant failed: quantities or financial values changed');
  return { invariantBefore: before, invariantAfter: after, quantitiesAndPostingsUnchanged: true,
    repairEvents };
}
