import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js";import { createHash, randomUUID } from 'node:crypto';
import { query, withTransaction } from '../../db.js';
import { atomicStockRequest } from '../../_lib/atomicStockRequest.js';
import { postStockMovementTx, recomputeLocationBalances } from '../../services/stockEngine.js';
import { lifecycleSchema, convertImportItemTx, allocateExpenses, fail } from '../../services/stockCostLayers.js';

async function handler(req, res) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (!['stock', 'stock_manager', 'admin', 'superadmin', 'super_admin', 'gm'].includes(String(req.user.role || '').toLowerCase()))
  return res.status(403).json({ success: false, error: 'Stock Manager access required' });
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const receiptKey = String(body.receiptKey || body.referenceId || '').trim();
  if (!receiptKey || receiptKey.length > 180) fail('A stable receiptKey is required; reuse it when retrying', 400);
  if (!Array.isArray(body.items) || !body.items.length) fail('At least one import line is required', 400);
  const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  await __qd_executePlan(query, __qd_registeredPlan("api/stock/import/receive.js:17:0"), [`import-receipt:${receiptKey}`]);
  const prior = (await __qd_executePlan(query, __qd_registeredPlan("api/stock/import/receive.js:18:1"), [receiptKey])).rows[0];
  if (prior) {
    if (prior.payload_hash !== hash) fail('Receipt key already used with different contents; create a new receipt draft', 409);
    return res.status(200).json({ ...prior.response, replayed: true });
  }
  const response = await withTransaction(async (client) => {
    const lines = [];
    for (const item of body.items) lines.push(await convertImportItemTx(client, item));
    const allocation = allocateExpenses(lines.map((l) => l.purchaseValue), body.expenses);
    const referenceId = `IMPORT-${randomUUID()}`;
    const posted = [];
    for (const [index, line] of lines.entries()) {
      const expense = allocation.allocations[index];
      // Calculate the received NUMERIC value before any Number conversion.
      // A recurring carton-derived unit cost must survive JSON snapshots.
      const exact = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock/import/receive.js:33:2"),


      [line.purchaseValue, expense, line.quantity])).rows[0];
      const landedValue = exact.landed,unitCIFExact = exact.unit;
      const unitCIF = unitCIFExact == null ? null : Number(unitCIFExact);
      const dpValue = line.unitDP == null ? null : line.unitDP * line.quantity;
      const importId = `IMP-${randomUUID()}`,batchId = `SB-IMP-${randomUUID()}`;
      const actor = req.user.fullName || req.user.username || req.user.id;
      const metadata = { ...body.metadata, ...line.metadata, receipt_key: receiptKey, line_index: index,
        entered_quantity: line.enteredQuantity, entered_unit: line.enteredUnit, base_unit: line.baseUnit,
        conversion_factor: line.factor, purchase_value: line.purchaseValue, allocated_expense: expense,
        expense_allocation_basis: 'purchase_value', landed_value: landedValue };
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock/import/receive.js:46:3"),




      [importId, body.supplierId || body.supplier_name || 'Unspecified supplier', referenceId, body.grn_number || null,
      body.invoice_number || null, body.shipment_reference || null, line.productName, line.productId,
      line.quantity, line.batchNo, line.expiryDate, unitCIF, landedValue, line.unitDP, dpValue,
      body.origin_country || null, body.notes || null, actor, JSON.stringify(metadata)]);
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock/import/receive.js:55:4"),




      [batchId, `BC-${randomUUID()}`, line.productName, line.batchNo, line.expiryDate, line.quantity, line.productId,
      body.supplierId || body.supplier_name || null, referenceId, importId, line.unitDP, dpValue, unitCIF, landedValue,
      body.notes || null, JSON.stringify(metadata)]);
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock/import/receive.js:63:5"), [unitCIFExact, line.unitDP, importId]);
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock/import/receive.js:64:6"), [unitCIFExact, line.unitDP, batchId]);
      const movement = await postStockMovementTx(client, { productName: line.productName, batchNo: line.batchNo, expiryDate: line.expiryDate,
        quantity: line.quantity, movementType: 'supplier_import_receipt', sourceLocation: body.supplierId || 'supplier',
        sourceLocationType: 'supplier', destinationLocation: 'country_stock', destinationLocationType: 'country',
        referenceId, notes: body.notes || 'Staff-confirmed import receipt', unitDP: line.unitDP, unitCIF, createdBy: actor });
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock/import/receive.js:69:7"),
      [unitCIFExact, line.unitDP, movement.movementId]);
      posted.push({ ...line, unitCIF, allocatedExpense: expense, landedValue: landedValue == null ? null : Number(landedValue), batchId, supplierImportId: importId, missingCost: unitCIF == null });
    }
    const result = { success: true, referenceId, destinationLocation: 'country_stock', itemsPosted: posted.length,
      expenseTotal: allocation.total, items: posted, message: `${posted.length} lines received into Country Stock.` };
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock/import/receive.js:75:8"),
    [receiptKey, hash, JSON.stringify(result)]);
    await recomputeLocationBalances('country', 'country_stock');
    return result;
  });
  return res.status(201).json(response);
}
export default atomicStockRequest(handler, ['POST']);
