import { getMany } from '../../db.js';

export async function getWarehouseBatches(warehouseKey) {
  return getMany(
    `SELECT id, description, batch_no, barcode, location, remaining_quantity, quantity,
            cif_unit_cost, dpc_unit_value, unit_price, expiry_date, dispatched_quantity, import_date as created_at
     FROM stock_batches
     WHERE location ILIKE $1
     ORDER BY description ASC, expiry_date ASC NULLS LAST`,
    [`%${warehouseKey}%`]
  );
}

export async function getWarehouseTransfers(warehouseKey, direction = 'all') {
  const locationFilter = `%${warehouseKey}%`;
  if (direction === 'incoming') {
    return getMany(
      `SELECT * FROM stock_transfers WHERE to_branch ILIKE $1 AND status != 'cancelled' ORDER BY created_at DESC LIMIT 200`,
      [locationFilter]
    ).catch(() => []);
  }
  if (direction === 'outbound') {
    return getMany(
      `SELECT * FROM stock_transfers WHERE from_warehouse ILIKE $1 AND status != 'cancelled' ORDER BY created_at DESC LIMIT 200`,
      [locationFilter]
    ).catch(() => []);
  }
  return getMany(
    `SELECT * FROM stock_transfers WHERE (from_warehouse ILIKE $1 OR to_branch ILIKE $1) AND status != 'cancelled' ORDER BY created_at DESC LIMIT 200`,
    [locationFilter]
  ).catch(() => []);
}

export async function getWarehouseMovements(warehouseKey) {
  return getMany(
    `SELECT * FROM stock_movements WHERE (source_location ILIKE $1 OR destination_location ILIKE $1) ORDER BY created_at DESC LIMIT 500`,
    [`%${warehouseKey}%`]
  ).catch(() => []);
}

export function buildWarehouseSummary(warehouseName, batches, inbound, outbound) {
  const totalProductLines = new Set(batches.map(b => b.description)).size;
  const totalUnits = batches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0), 0);
  const cifValue = batches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0) * Number(b.cif_unit_cost || b.unit_price || 0), 0);
  const dpcValue = batches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0) * Number(b.dpc_unit_value || b.unit_price || 0), 0);

  return {
    warehouseId: `wh_${warehouseName.toLowerCase()}`,
    warehouseName: `${warehouseName} Warehouse`,
    productLines: totalProductLines,
    totalUnits,
    cifValue: parseFloat(cifValue.toFixed(2)),
    dpcValue: parseFloat(dpcValue.toFixed(2)),
    pendingInbound: inbound.filter(t => ['pending', 'in_transit', 'dispatched'].includes(t.status)).length,
    pendingOutbound: outbound.filter(t => ['pending', 'dispatched'].includes(t.status)).length,
  };
}

export function formatBatchItems(batches) {
  return batches.map(b => ({
    productId: b.id,
    productName: b.description,
    batchNo: b.batch_no || b.barcode,
    availableQty: Number(b.remaining_quantity || b.quantity || 0),
    dispatchedQty: Number(b.dispatched_quantity || 0),
    expiryDate: b.expiry_date,
    unitCIF: Number(b.cif_unit_cost || b.unit_price || 0),
    unitDPC: Number(b.dpc_unit_value || b.unit_price || 0),
    stockValueDPC: Number(b.remaining_quantity || b.quantity || 0) * Number(b.dpc_unit_value || b.unit_price || 0),
  }));
}
