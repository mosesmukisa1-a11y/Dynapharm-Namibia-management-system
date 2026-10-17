import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne } from '../db.js';
import { reportInstantPredicate } from '../services/reportDateBounds.js';
import { businessDay, validateBusinessDates } from '../services/businessDates.js';
import { COMPANY_REPORT_ROLES } from '../services/dailySales.js';

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function normalizeReceipt(row) {
  if (!row) return null;
  const savedTotal = row.total ?? row.total_amount;
  const total = savedTotal == null ? null : Number(savedTotal);
  const subtotal = Number(row.subtotal || 0);
  const discount = Number(row.discount || 0);
  const tax = Number(row.tax || 0);
  const items = normalizeItems(row.items);
  const saleDate =
  row.sale_date instanceof Date ?
  row.sale_date.toISOString() :
  typeof row.sale_date === 'string' ?
  row.sale_date :
  row.created_at instanceof Date ?
  row.created_at.toISOString() :
  null;
  const saleDateObj = saleDate ? new Date(saleDate) : null;
  return {
    id: row.id,
    saleNumber: row.sale_number,
    receiptNumber: row.sale_number || row.id,
    branchId: row.branch_id,
    branch: row.branch_id,
    customerName: row.customer_name,
    clientName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    customerType: row.customer_type,
    paymentMethod: row.payment_method,
    type: row.customer_type || row.payment_method || 'walk-in',
    subtotal,
    discount,
    tax,
    total,
    totalAmount: total,
    chargedAmount: row.source === 'prescription' ? null : total,
    amountBasis: row.source === 'prescription' ? 'prescription_dp_only' : 'original_customer_charge',
    missingAmountEvidence: total === null,
    totalBV: Number(row.total_bv || 0),
    status: row.status || 'completed',
    saleDate,
    businessDate: saleDateObj ? businessDay(saleDateObj) : null,
    date: saleDateObj ? saleDateObj.toISOString().slice(0, 10) : '',
    timestamp: saleDateObj ? saleDateObj.toISOString() : new Date().toISOString(),
    createdAt: row.created_at,
    source: row.source || 'walkin',
    items: items.map((item) => ({
      productName: item.productName || item.product_name || item.name || item.product || '',
      productCode: item.productCode || item.sku || '',
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice ?? item.unit_price ?? item.price ?? 0),
      amount: Number(item.amount ?? item.line_total ?? item.total ?? (item.quantity || 0) * (item.unitPrice ?? item.unit_price ?? item.price ?? 0))
    })),
    products: items.map((item) => ({
      name: item.productName || item.product_name || item.name || item.product || '',
      sku: item.productCode || item.sku || '',
      quantity: Number(item.quantity || 0),
      amount: Number(item.amount ?? item.line_total ?? item.total ?? (item.quantity || 0) * (item.unitPrice ?? item.unit_price ?? item.price ?? 0))
    })),
    data: typeof row.data === 'object' && row.data !== null ? row.data : row.data ? (() => {
      try {return JSON.parse(row.data);} catch {return {};}
    })() : {}
  };
}

function summarizeReceipts(receipts) {
  const summary = {
    count: receipts.length,
    totalAmount: 0,
    branches: new Map()
  };
  receipts.forEach((receipt) => {
    summary.totalAmount += Number(receipt.total || 0);
    const key = receipt.branchId || 'unknown';
    if (!summary.branches.has(key)) {
      summary.branches.set(key, {
        branch: key,
        count: 0,
        total: 0
      });
    }
    const branchSummary = summary.branches.get(key);
    branchSummary.count += 1;
    branchSummary.total += Number(receipt.total || 0);
  });
  summary.branchBreakdown = Array.from(summary.branches.values()).sort((a, b) =>
  a.branch.localeCompare(b.branch)
  );
  summary.customerChargedAmount = receipts.filter((r) => r.amountBasis === 'original_customer_charge').reduce((s, r) => s + Number(r.total ?? 0), 0);
  summary.prescriptionDPAmount = receipts.filter((r) => r.amountBasis === 'prescription_dp_only').reduce((s, r) => s + Number(r.total ?? 0), 0);
  summary.missingAmountEvidence = receipts.filter((r) => r.missingAmountEvidence).length;
  summary.mixedBases = new Set(receipts.map((r) => r.amountBasis)).size > 1;
  if (summary.mixedBases || summary.missingAmountEvidence) summary.totalAmount = null;
  // Never present a combined branch figure as comparable charged revenue.
  for (const branch of summary.branchBreakdown) {
    const rows = receipts.filter((r) => (r.branchId || 'unknown') === branch.branch);
    if (new Set(rows.map((r) => r.amountBasis)).size > 1 || rows.some((r) => r.missingAmountEvidence)) branch.total = null;
  }
  return summary;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (!COMPANY_REPORT_ROLES.has(req.user.role)) return res.status(403).json({ success: false, error: 'Company receipts reporting access required' });

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const dateParam = searchParams.get('date');
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    const branchParam = searchParams.get('branch');
    const qParam = searchParams.get('q');

    // ── Walk-in sales query ───────────────────────────────────────────────────
    const walkinParams = [];
    const walkinWhere = [];

    if (dateParam) {
      const parsed = parseDate(dateParam);
      if (!parsed) {
        return res.status(400).json({ success: false, error: 'Invalid date parameter' });
      }
      const day = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : businessDay(parsed);
      const position = `$${walkinParams.length + 1}`;
      walkinWhere.push(reportInstantPredicate('sale_date', position, day), reportInstantPredicate('sale_date', position, day, true));
      walkinParams.push(day);
    } else {
      if (startParam && endParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam) && /^\d{4}-\d{2}-\d{2}$/.test(endParam)) validateBusinessDates(startParam, endParam);
      for (const [value, end] of [[startParam, false], [endParam, true]]) if (value) {
        walkinWhere.push(reportInstantPredicate('sale_date', `$${walkinParams.length + 1}`, value, end));
        walkinParams.push(value);
      }
      if (!startParam && !endParam) {
        walkinWhere.push(__qd_registeredPlan("api/mis/receipts.js:169:1"));
      }
    }

    if (branchParam && branchParam !== 'all') {
      walkinWhere.push(__qd_registeredPlan("api/mis/receipts.js:174:2", [walkinParams.length + 1]));
      walkinParams.push(branchParam);
    }

    if (qParam && qParam.trim()) {
      const like = `%${qParam.trim()}%`;
      walkinParams.push(like);
      walkinWhere.push(__qd_registeredPlan("api/mis/receipts.js:181:3", [walkinParams.length, walkinParams.length, walkinParams.length]));
    }

    // Only completed sales, and exclude any receipt that has an approved refund —
    // a refunded receipt should not appear in the MIS entry list.
    walkinWhere.unshift(__qd_registeredPlan("api/mis/receipts.js:186:4")



    );
    walkinWhere.unshift(__qd_registeredPlan("api/mis/receipts.js:191:5"));

    let walkinQuery = __qd_registeredPlan("api/mis/receipts.js:193:0");





    if (walkinWhere.length > 0) {
      walkinQuery = __qd_joinPlans([walkinQuery, __qd_registeredPlan("api/mis/receipts.js:200:6", [__qd_joinPlans(walkinWhere, "and")])], "empty");
    }
    walkinQuery = __qd_joinPlans([walkinQuery, __qd_registeredPlan("api/mis/receipts.js:202:7")], "empty");

    // ── Prescription dispensing query ─────────────────────────────────────────
    const rxParams = [];
    const rxWhere = [__qd_registeredPlan("api/mis/receipts.js:207:8"),

    // Include every confirmed dispense event — partial OR full.
    // dispense.js writes workflow_source='branch_portal' with payment_status='paid' each time
    // Confirm Dispense is clicked (staff always selects payment method first).
    // capture-rx.js writes workflow_source='dispense_draft' as a summary; excluded here to avoid double-counting.
    __qd_registeredPlan("api/mis/receipts.js:212:9")];


    if (dateParam) {
      const parsed = parseDate(dateParam);
      if (parsed) {
        rxParams.push(/^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : businessDay(parsed));
        rxWhere.push(__qd_registeredPlan("api/mis/receipts.js:219:10", [rxParams.length]));
      }
    } else {
      const start = parseDate(startParam);
      const end = parseDate(endParam);
      if (start && end) {
        rxParams.push(/^\d{4}-\d{2}-\d{2}$/.test(startParam) ? startParam : businessDay(start), /^\d{4}-\d{2}-\d{2}$/.test(endParam) ? endParam : businessDay(end));
        rxWhere.push(__qd_registeredPlan("api/mis/receipts.js:226:11", [rxParams.length - 1, rxParams.length]));
      } else if (start) {
        rxParams.push(/^\d{4}-\d{2}-\d{2}$/.test(startParam) ? startParam : businessDay(start));
        rxWhere.push(__qd_registeredPlan("api/mis/receipts.js:229:12", [rxParams.length]));
      } else if (end) {
        rxParams.push(/^\d{4}-\d{2}-\d{2}$/.test(endParam) ? endParam : businessDay(end));
        rxWhere.push(__qd_registeredPlan("api/mis/receipts.js:232:13", [rxParams.length]));
      } else {
        rxWhere.push(__qd_registeredPlan("api/mis/receipts.js:234:14"));
      }
    }

    if (branchParam && branchParam !== 'all') {
      rxParams.push(branchParam);
      rxWhere.push(__qd_registeredPlan("api/mis/receipts.js:240:15", [rxParams.length]));
    }

    if (qParam && qParam.trim()) {
      const like = `%${qParam.trim()}%`;
      rxParams.push(like);
      rxWhere.push(__qd_registeredPlan("api/mis/receipts.js:246:16", [rxParams.length, rxParams.length]));
    }

    // One row per prescription (deduplicate by form_reference_id — one activity record per dispense event)
    const rxQuery = __qd_registeredPlan("api/mis/receipts.js:250:17", [__qd_joinPlans(





















      rxWhere, "and")]);




    const [walkinRows, rxRows] = await Promise.all([__qd_executePlan(
      getMany, walkinQuery, walkinParams), __qd_executePlan(
      getMany, rxQuery, rxParams)]
    );
    // Receipt amount is the original saved customer charge, not today's DP,
    // received DPC, or a recomputation from catalogue prices. Prescription DP
    // records remain separately labelled; no historical row is rewritten.

    const allRows = [...walkinRows, ...rxRows];

    // Sort combined results by sale_date descending
    allRows.sort((a, b) => {
      const da = new Date(a.sale_date || a.created_at || 0);
      const db = new Date(b.sale_date || b.created_at || 0);
      return db - da;
    });

    const receipts = allRows.slice(0, 3000).map(normalizeReceipt).filter(Boolean);
    const totals = summarizeReceipts(receipts);

    return res.status(200).json({
      success: true,
      receipts,
      totals
    });
  } catch (error) {
    console.error('MIS receipts API error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error?.message || 'Internal server error'
    });
  }
}
