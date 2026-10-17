import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js";import { getMany, query } from '../../db.js';

export async function getWarehouseBatches(warehouseKey) {
  try {
    return await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/warehouses/_warehouseHelper.js:6:0"),






























    [warehouseKey]);

  } catch (err) {
    console.error(`getWarehouseBatches(${warehouseKey}) error:`, err.message);
    return [];
  }
}

export async function getWarehouseTransfers(warehouseKey, direction = 'all') {
  let transferRows;
  if (direction === 'incoming') {
    transferRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/warehouses/_warehouseHelper.js:48:1"),

    [warehouseKey]).
    catch(() => []);
  } else if (direction === 'outbound') {
    transferRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/warehouses/_warehouseHelper.js:53:2"),

    [warehouseKey]).
    catch(() => []);
  } else {
    transferRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/warehouses/_warehouseHelper.js:58:3"),

    [warehouseKey]).
    catch(() => []);
  }

  if (transferRows.length === 0) return [];

  const ids = transferRows.map((t) => t.id);
  let itemMap = {};
  try {
    // migration 013_stock_enhancements.sql adds expiry_date, quantity_approved, and
    // quantity_received to stock_transfer_items — include them here.
    const itemRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/warehouses/_warehouseHelper.js:71:4"),




    [ids]);

    for (const row of itemRows) {
      if (!itemMap[row.transfer_id]) itemMap[row.transfer_id] = [];
      itemMap[row.transfer_id].push({
        id: row.id,
        productId: row.product_id || null,
        productName: row.product_name,
        batchNo: row.batch_no || null,
        expiryDate: row.expiry_date instanceof Date ?
        row.expiry_date.toISOString().split('T')[0] :
        row.expiry_date || null,
        quantity: Number(row.quantity || 0),
        quantityApproved: row.quantity_approved != null ? Number(row.quantity_approved) : null,
        quantityReceived: row.quantity_received != null ? Number(row.quantity_received) : null,
        unit: row.unit || null,
        metadata: row.metadata || null
      });
    }
  } catch (_) {}

  return transferRows.map((t) => ({
    ...t,
    items: itemMap[t.id] || []
  }));
}

export async function getWarehouseMovements(warehouseKey) {
  return __qd_executePlan(getMany, __qd_registeredPlan("api/stock/warehouses/_warehouseHelper.js:104:5"),

  [warehouseKey]).
  catch(() => []);
}

export async function getWarehouseWriteoffReturns(warehouseKey) {
  return __qd_executePlan(getMany, __qd_registeredPlan("api/stock/warehouses/_warehouseHelper.js:111:6"),




















  [warehouseKey]).
  catch(() => []);
}

export function buildWarehouseSummary(warehouseName, batches, inbound, outbound) {
  const totalProductLines = new Set(batches.map((b) => b.description)).size;
  const totalUnits = batches.reduce((s, b) => s + Number(b.remaining_quantity ?? 0), 0);
  const cifValue = batches.reduce((s, b) => s + Number(b.remaining_quantity ?? 0) * Number(b.cif_unit_cost || b.unit_price || 0), 0);
  const dpcValue = batches.reduce((s, b) => s + Number(b.remaining_quantity ?? 0) * Number(b.dpc_unit_value || b.unit_price || 0), 0);

  return {
    warehouseId: `${warehouseName.toLowerCase()}_warehouse`,
    warehouseName: `${warehouseName} Warehouse`,
    productLines: totalProductLines,
    totalUnits,
    cifValue: parseFloat(cifValue.toFixed(2)),
    dpcValue: parseFloat(dpcValue.toFixed(2)),
    pendingInbound: inbound.filter((t) => ['pending', 'pending_approval', 'in_transit', 'dispatched', 'approved'].includes(t.status)).length,
    pendingOutbound: outbound.filter((t) => ['pending', 'pending_approval', 'approved', 'dispatched', 'in_transit'].includes(t.status)).length
  };
}

export function formatBatchItems(batches) {
  const arr = Array.isArray(batches) ? batches : [];
  return arr.map((b) => ({
    productId: b.product_id, // product master ID (not the batch PK)
    batchId: b.id, // stock_batches PK — kept for callers that need the row reference
    productName: b.description,
    batchNo: b.batch_no || b.barcode,
    availableQty: Number(b.remaining_quantity ?? 0),
    dispatchedQty: Number(b.dispatched_quantity || 0),
    expiryDate: b.expiry_date,
    unitCIF: Number(b.cif_unit_cost || b.unit_price || 0),
    unitDPC: Number(b.dpc_unit_value || b.unit_price || 0),
    stockValueDPC: Number(b.remaining_quantity ?? 0) * Number(b.dpc_unit_value || b.unit_price || 0)
  }));
}
