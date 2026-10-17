import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js"; /**
 * POST /api/sales/non-member
 * Create a non-member walk-in sale. Saves sale + reduces stock by batch.
 */
import { postStockMovement, recomputeLocationBalances } from '../services/stockEngine.js';
import { query, getOne } from '../db.js';
import { getBranchScope } from '../_lib/auth.js';

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => raw += c);
    req.on('end', () => {try {resolve(raw ? JSON.parse(raw) : {});} catch {reject(new Error('Invalid JSON'));}});
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const body = await parseBody(req);
  const { branchId, customerName, referralDistributorId, items, soldBy, paymentMethod, notes } = body;

  if (!branchId) return res.status(400).json({ success: false, error: 'branchId is required' });

  const branchScope = getBranchScope(req.user);
  if (branchScope.enforced && !branchScope.branches.includes(branchId)) {
    return res.status(403).json({ success: false, error: 'Access denied: cannot create sales for this branch' });
  }
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'items array is required' });

  const validationErrors = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.batchNo) validationErrors.push(`Item ${i + 1}: batchNo is required`);
    if (!item.expiryDate) validationErrors.push(`Item ${i + 1}: expiryDate is required`);
    if (!item.quantity || Number(item.quantity) <= 0) validationErrors.push(`Item ${i + 1}: quantity must be > 0`);
  }
  if (validationErrors.length > 0) {
    return res.status(422).json({ success: false, error: 'Validation failed', validationErrors });
  }

  let totalAmount = 0;
  const saleItems = [];
  for (const item of items) {
    const productName = item.productName || item.product_name || '';
    const qty = Number(item.quantity);
    const unitDP = Number(item.unitDP || item.unit_dp || 0);
    totalAmount += qty * unitDP;
    saleItems.push({ productName, batchNo: item.batchNo, expiryDate: item.expiryDate, quantity: qty, unitDP });
  }

  const ts = Date.now();
  const saleId = `NMS-${ts}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const saleNumber = `NM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 9000 + 1000)}`;

  // Get referral distributor name if provided
  let referralName = null,referralNb = null;
  if (referralDistributorId) {
    const dist = await __qd_executePlan(getOne, __qd_registeredPlan("api/sales/non-member.js:65:0"), [referralDistributorId]);
    referralName = dist?.distributor_name || null;
    referralNb = dist?.distributor_code || null;
  }

  // Save to branch_walkin_sales
  await __qd_executePlan(query, __qd_registeredPlan("api/sales/non-member.js:72:1"),




  [saleId, branchId, saleNumber, customerName || 'Walk-in', paymentMethod || 'cash',
  totalAmount,
  JSON.stringify(saleItems.map((i) => ({ productName: i.productName, quantity: i.quantity, unitPrice: i.unitDP, lineTotal: i.quantity * i.unitDP, batchNo: i.batchNo, expiryDate: i.expiryDate }))),
  soldBy || 'system',
  JSON.stringify({ referralDistributorId, referralName, referralNb, notes })]);



  // Post stock movements per item (reduces branch stock)
  for (const item of saleItems) {
    if (!item.productName) continue;
    await postStockMovement({
      productName: item.productName,
      batchNo: item.batchNo,
      expiryDate: item.expiryDate,
      quantity: item.quantity,
      movementType: 'walkin_non_member_sale',
      sourceLocation: branchId,
      sourceLocationType: 'branch',
      destinationLocation: 'customer',
      destinationLocationType: null,
      referenceId: saleId,
      notes: notes || `Non-member sale to ${customerName || 'Walk-in'}`,
      unitDP: item.unitDP,
      createdBy: soldBy || 'system',
      status: 'posted'
    });
  }

  recomputeLocationBalances('branch', branchId).catch((e) =>
  console.error('[stockEngine] non-member sale recompute error:', e.message)
  );

  return res.status(201).json({
    success: true,
    saleId,
    saleNumber,
    branchId,
    customerType: 'non_member',
    customerName: customerName || 'Walk-in',
    referralDistributorId,
    referralName,
    referralNb,
    totalAmount,
    itemsCount: saleItems.length,
    message: `Non-member sale ${saleNumber} created successfully.`
  });
}
