import { getMany, query } from '../../db.js';

export async function getWarehouseBatches(warehouseKey) {
  return getMany(
    `SELECT sb.id, sb.description, sb.batch_no, sb.barcode, sb.location,
            sb.remaining_quantity, sb.quantity,
            sb.cif_unit_cost, sb.dpc_unit_value, sb.unit_price,
            sb.expiry_date, sb.dispatched_quantity,
            sb.import_date AS created_at,
            sb.notes,
            COALESCE(
              wim.notes,
              CASE WHEN sb.batch_no IS NOT NULL THEN (
                SELECT st.from_warehouse
                FROM stock_transfers st
                JOIN stock_transfer_items sti ON sti.transfer_id = st.id
                WHERE st.to_branch = $1
                  AND LOWER(COALESCE(sti.batch_no, '')) = LOWER(sb.batch_no)
                ORDER BY st.created_at DESC LIMIT 1
              ) END
            ) AS dispatch_source
     FROM stock_batches sb
     LEFT JOIN warehouse_inventory_movements wim
            ON wim.warehouse_id = $1
           AND wim.batch_no    = sb.batch_no
           AND wim.movement_type = 'write_off_return'
     WHERE sb.location = $1
       AND sb.remaining_quantity > 0
       AND COALESCE(sb.status, '') != 'expired'
     ORDER BY sb.description ASC, sb.expiry_date ASC NULLS LAST`,
    [warehouseKey]
  );
}

export async function getWarehouseTransfers(warehouseKey, direction = 'all') {
  let transferRows;
  if (direction === 'incoming') {
    transferRows = await getMany(
      `SELECT * FROM stock_transfers WHERE to_branch = $1 AND status != 'cancelled' ORDER BY created_at DESC LIMIT 200`,
      [warehouseKey]
    ).catch(() => []);
  } else if (direction === 'outbound') {
    transferRows = await getMany(
      `SELECT * FROM stock_transfers WHERE from_warehouse = $1 AND status != 'cancelled' ORDER BY created_at DESC LIMIT 200`,
      [warehouseKey]
    ).catch(() => []);
  } else {
    transferRows = await getMany(
      `SELECT * FROM stock_transfers WHERE (from_warehouse = $1 OR to_branch = $1) AND status != 'cancelled' ORDER BY created_at DESC LIMIT 200`,
      [warehouseKey]
    ).catch(() => []);
  }

  if (transferRows.length === 0) return [];

  const ids = transferRows.map(t => t.id);
  let itemMap = {};
  try {
    const itemRows = await getMany(
      `SELECT transfer_id, product_name, batch_no, expiry_date, quantity, quantity_approved, quantity_received
       FROM stock_transfer_items WHERE transfer_id = ANY($1::text[]) ORDER BY created_at ASC`,
      [ids]
    );
    for (const row of itemRows) {
      if (!itemMap[row.transfer_id]) itemMap[row.transfer_id] = [];
      itemMap[row.transfer_id].push({
        productName: row.product_name,
        batchNo:     row.batch_no || null,
        expiryDate:  row.expiry_date
          ? (row.expiry_date instanceof Date ? row.expiry_date.toISOString().split('T')[0] : row.expiry_date)
          : null,
        quantity:          Number(row.quantity || 0),
        quantityApproved:  row.quantity_approved != null ? Number(row.quantity_approved) : null,
        quantityReceived:  row.quantity_received != null ? Number(row.quantity_received) : null,
      });
    }
  } catch (_) {}

  return transferRows.map(t => ({
    ...t,
    items: itemMap[t.id] || [],
  }));
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
            sm.write_off_reason AS write_off_reason
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
  const totalUnits = batches.reduce((s, b) => s + Number(b.remaining_quantity ?? 0), 0);
  const cifValue = batches.reduce((s, b) => s + Number(b.remaining_quantity ?? 0) * Number(b.cif_unit_cost || b.unit_price || 0), 0);
  const dpcValue = batches.reduce((s, b) => s + Number(b.remaining_quantity ?? 0) * Number(b.dpc_unit_value || b.unit_price || 0), 0);

  return {
    warehouseId: `wh_${warehouseName.toLowerCase()}`,
    warehouseName: `${warehouseName} Warehouse`,
    productLines: totalProductLines,
    totalUnits,
    cifValue: parseFloat(cifValue.toFixed(2)),
    dpcValue: parseFloat(dpcValue.toFixed(2)),
    pendingInbound: inbound.filter(t => ['pending', 'in_transit', 'dispatched', 'approved'].includes(t.status)).length,
    pendingOutbound: outbound.filter(t => ['pending', 'dispatched'].includes(t.status)).length,
  };
}

export function formatBatchItems(batches) {
  return batches.map(b => ({
    productId: b.id,
    productName: b.description,
    batchNo: b.batch_no || b.barcode,
    availableQty: Number(b.remaining_quantity ?? 0),
    dispatchedQty: Number(b.dispatched_quantity || 0),
    expiryDate: b.expiry_date,
    unitCIF: Number(b.cif_unit_cost || b.unit_price || 0),
    unitDPC: Number(b.dpc_unit_value || b.unit_price || 0),
    stockValueDPC: Number(b.remaining_quantity ?? 0) * Number(b.dpc_unit_value || b.unit_price || 0),
  }));
}
