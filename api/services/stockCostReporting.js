import { getMany } from '../db.js';
import { branchLayers, day, nullableNumber, sourceSnapshot } from './stockCostLayers.js';
import { ALL_BRANCH_LOCATION_ALIASES } from '../_lib/branchUtils.js';

// Read-only projection: never reconstruct physical stock from an incomplete ledger.
// Reservation quantities are held separately from the legacy available counters.
export async function getStockCostProjection(read=getMany) {
  const [stock,branches,reservations,segregated]=await Promise.all([
    read('SELECT * FROM stock_batches WHERE remaining_quantity>0'),
    read('SELECT * FROM branch_inventory_batches WHERE quantity>0'),
    read(`SELECT a.*,t.from_warehouse AS location,t.status FROM stock_transfer_allocations a
      JOIN stock_transfers t ON t.id=a.transfer_id WHERE t.status IN ('approved','dispatched','in_transit','partially_received')
      ORDER BY a.line_id,a.allocation_order`),
    read(`SELECT * FROM stock_segregated_batches WHERE quantity>0`),
  ]);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Windhoek',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const rows=[];
  const add=({id,location,productName,batchNo,expiryDate,quantity,source,condition='saleable',reserved=false,transit=false})=>{
    const expired=expiryDate && expiryDate<today;
    const eligible=condition==='saleable' && !expired && !reserved && !transit;
    rows.push({id,location,productName,batchNo,expiryDate,condition,
      availableQty:eligible ? quantity : 0,reservedQty:reserved ? quantity : 0,
      onHandQty:transit ? 0 : quantity,inTransitQty:transit ? quantity : 0,
      quarantinedQty:condition!=='saleable' ? quantity : 0,expiredQty:expired ? quantity : 0,missingExpiry:!expiryDate,
      qty:quantity,unitCIF:nullableNumber(source?.cif_unit_cost),unitDPC:nullableNumber(source?.dpc_unit_value),
      missingCostQuantity:source?.cif_unit_cost==null ? quantity : 0,
      missingDPCQuantity:source?.dpc_unit_value==null ? quantity : 0,sourceBatchId:source?.id || null});
  };
  for (const row of stock.filter(r=>!ALL_BRANCH_LOCATION_ALIASES.includes(String(r.location || '').toLowerCase()) && !String(r.location || '').endsWith('_branch'))) add({id:row.id,location:row.location || row.warehouse_id,productName:row.description,
    batchNo:row.batch_no,expiryDate:day(row.expiry_date),quantity:Number(row.remaining_quantity),source:sourceSnapshot(row),
    condition:['available','in_stock','active'].includes(row.status || 'available') ? 'saleable' : row.status});
  for (const row of branches) {
    for (const [index,layer] of branchLayers(row).entries()) add({id:`${row.id}:${index}`,location:row.branch_id,
      productName:row.product_name,batchNo:row.batch_no,expiryDate:day(row.expiry_date),quantity:layer.quantity,source:layer.source,
      condition:['available','in_stock','active'].includes(row.status || 'in_stock') ? 'saleable' : row.status});
  }
  // Remove cumulative received entitlements from transit, in allocation order.
  const received=new Map();
  const lines=reservations.length ? await read('SELECT id,quantity_received FROM stock_transfer_items WHERE id=ANY($1::bigint[])',
    [[...new Set(reservations.map(r=>r.line_id))]]) : [];
  for (const line of lines) received.set(String(line.id),Number(line.quantity_received || 0));
  for (const row of reservations) {
    const reserved=row.status==='approved',before=reserved ? 0 : received.get(String(row.line_id)) || 0;
    const quantity=Math.max(0,Number(row.quantity)-before);
    received.set(String(row.line_id),Math.max(0,before-Number(row.quantity)));
    if (quantity) add({id:row.id,location:reserved ? row.location : `in_transit:${row.transfer_id}`,
      productName:row.snapshot.product_name,batchNo:row.snapshot.batch_no,expiryDate:day(row.snapshot.expiry_date),
      quantity,source:row.snapshot.source,reserved,transit:!reserved});
  }
  for (const row of segregated) add({id:row.id,location:row.location,productName:row.snapshot.product_name,
    batchNo:row.snapshot.batch_no,expiryDate:day(row.snapshot.expiry_date),quantity:Number(row.quantity),
    source:{id:row.snapshot.source_batch_id,cif_unit_cost:row.snapshot.unit_cost,dpc_unit_value:row.snapshot.unit_dp},
    condition:row.condition || 'quarantine'});
  return rows;
}

export async function getSalesCostReport({aliases,from,to}={}) {
  const rows=await getMany(`SELECT a.*,sm.unit_cif,sm.unit_dp FROM stock_sale_allocations a
    JOIN stock_movements sm ON sm.id=a.movement_id AND sm.status IN ('posted','approved')
    WHERE ($1::text[] IS NULL OR LOWER(TRIM(a.branch_id))=ANY($1))
      AND ($2::date IS NULL OR a.created_at >= $2::date)
      AND ($3::date IS NULL OR a.created_at < $3::date + INTERVAL '1 day')
    ORDER BY a.created_at,a.movement_id`,[aliases || null,from || null,to || null]);
  const legacy=await getMany(`SELECT sm.id AS movement_id,sm.reference_id AS sale_reference,
    sm.source_location AS branch_id,sm.product_name,sm.batch_no,sm.expiry_date,sm.quantity,'{}'::jsonb AS snapshot
    FROM stock_movements sm LEFT JOIN stock_sale_allocations a ON a.movement_id=sm.id
    WHERE a.movement_id IS NULL AND sm.status IN ('posted','approved')
      AND sm.movement_type IN ('walkin_sale','walkin_member_sale','walkin_non_member_sale','walk_in_member_sale',
        'walk_in_non_member_sale','prescription_dispense','campaign_sale','campaign_free_item','online_order_fulfilment')
      AND ($1::text[] IS NULL OR LOWER(TRIM(sm.source_location))=ANY($1))
      AND ($2::date IS NULL OR sm.created_at >= $2::date)
      AND ($3::date IS NULL OR sm.created_at < $3::date + INTERVAL '1 day')`,
      [aliases || null,from || null,to || null]);
  rows.push(...legacy);
  return rows.map(row=>{
    const layers=row.snapshot.cost_layers || [{quantity:Number(row.quantity),source:{cif_unit_cost:row.snapshot.unit_cost,dpc_unit_value:row.snapshot.unit_dp}}];
    const revenue=row.snapshot.revenue_unit==null ? null : Number(row.snapshot.revenue_unit)*Number(row.quantity);
    const knownCost=layers.reduce((sum,l)=>sum+Number(l.source?.cif_unit_cost ?? 0)*Number(l.quantity),0);
    const missingCostQuantity=layers.filter(l=>l.source?.cif_unit_cost==null).reduce((sum,l)=>sum+Number(l.quantity),0);
    return {saleReference:row.sale_reference,branchId:row.branch_id,productName:row.product_name,batchNo:row.batch_no,
      expiryDate:day(row.expiry_date),quantity:Number(row.quantity),allocations:layers,
      knownCost,revenue,grossProfit:revenue==null || missingCostQuantity ? null : revenue-knownCost,
      missingRevenueQuantity:revenue==null ? Number(row.quantity) : 0,
      knownDPC:layers.reduce((sum,l)=>sum+Number(l.source?.dpc_unit_value ?? 0)*Number(l.quantity),0),
      missingCostQuantity};
  });
}
