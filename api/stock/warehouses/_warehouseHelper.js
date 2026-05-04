import { getMany } from '../../db.js';

export async function getWarehouseBatches(warehouseKey) {
  return getMany(
    `SELECT id, description, batch_no, barcode, location, remaining_quantity, quantity,
            cif_unit_cost, dpc_unit_value, unit_price, expiry_date, dispatched_quantity, import_date as created_at
     FROM stock_batches
     WHERE location = $1
     ORDER BY description ASC, expiry_date ASC NULLS LAST`,
    [warehouseKey]
  );
}

export async function getWarehouseTransfers(warehouseKey, direction = 'all') {
  if (direction === 'incoming') {
    return getMany(
      `SELECT * FROM stock_transfers WHERE to_branch = $1 AND status != 'cancelled' ORDER BY created_at DESC LIMIT 200`,
      [warehouseKey]
    ).catch(() => []);
  }
  if (direction === 'outbound') {
    return getMany(
      `SELECT * FROM stock_transfers WHERE from_warehouse = $1 AND status != 'cancelled' ORDER BY created_at DESC LIMIT 200`,
      [warehouseKey]
    ).catch(() => []);
  }
  return getMany(
    `SELECT * FROM stock_transfers WHERE (from_warehouse = $1 OR to_branch = $1) AND status != 'cancelled' ORDER BY created_at DESC LIMIT 200`,
    [warehouseKey]
  ).catch(() => []);
}

export async function getWarehouseMovements(warehouseKey) {
  return getMany(
    `SELECT * FROM stock_movements WHERE (source_location = $1 OR destination_location = $1) ORDER BY created_at DESC LIMIT 500`,
    [warehouseKey]
  ).catch(() => []);
}

export async function getWarehouseWriteoffReturns(warehouseKey) {
  return getMany(
    `SELECT wim.id,
            wim.warehouse_id,
            wim.product_name,
            wim.batch_no,
            wim.quantity,
            wim.reference,
            wim.notes,
            wim.created_by,
            wim.created_at,
            sm.source_location  AS source_branch,
            sm.expiry_date      AS expiry_date,
            sm.write_off_reason AS write_off_reason,
            sm.reason           AS reason
     FROM warehouse_inventory_movements wim
     LEFT JOIN stock_movements sm
            ON sm.reference_id = wim.reference
           AND sm.movement_type = 'write_off'
     WHERE wim.warehouse_id = $1
       AND wim.movement_type = 'write_off_return'
     ORDER BY wim.created_at DESC
     LIMIT 200`,
    [warehouseKey]
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
