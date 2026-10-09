import { randomUUID } from 'node:crypto';
import { inferLocationType } from './stockEngine.js';
import { branchSearchTerms } from '../_lib/branchUtils.js';

export const lifecycleSchema = `
CREATE TABLE IF NOT EXISTS stock_product_packs (
 product_name TEXT PRIMARY KEY, base_unit TEXT NOT NULL, packs JSONB NOT NULL DEFAULT '[]',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS stock_import_receipts (
 receipt_key TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, response JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS stock_transfer_allocations (
 id TEXT PRIMARY KEY, allocation_order BIGSERIAL, transfer_id TEXT NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
 line_id BIGINT NOT NULL REFERENCES stock_transfer_items(id) ON DELETE CASCADE,
 source_type TEXT NOT NULL, source_id TEXT NOT NULL, quantity NUMERIC NOT NULL CHECK(quantity>0),
 snapshot JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS stock_transfer_allocations_transfer ON stock_transfer_allocations(transfer_id,line_id);
ALTER TABLE stock_batches ADD COLUMN IF NOT EXISTS original_unit_cif NUMERIC;
ALTER TABLE stock_batches ADD COLUMN IF NOT EXISTS original_unit_dp NUMERIC;
ALTER TABLE supplier_imports ADD COLUMN IF NOT EXISTS original_unit_cif NUMERIC;
ALTER TABLE supplier_imports ADD COLUMN IF NOT EXISTS original_unit_dp NUMERIC;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS original_unit_cif NUMERIC;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS original_unit_dp NUMERIC;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS on_hand_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS available_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS reserved_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS quarantined_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS expired_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS in_transit_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS missing_cost_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS missing_dp_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS projection_version INTEGER NOT NULL DEFAULT 0;
`;
export const day = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10) || null;
export const nullableNumber = value => value == null || value === '' ? null : Number(value);
export function fail(message, statusCode=422) { throw Object.assign(new Error(message),{statusCode}); }

// Integer minor units and deterministic largest-remainder reconciliation.
export function allocateExpenses(values, expenses) {
  const cents = ['freight','duty','other'].reduce((sum,key) => {
    const value=nullableNumber(expenses?.[key]) ?? 0;
    if (!Number.isFinite(value) || value<0 || Math.abs(value*100-Math.round(value*100))>1e-7)
      fail(`${key} must be a non-negative amount with at most two decimals`);
    return sum+Math.round(value*100);
  },0);
  const total=values.reduce((sum,value)=>sum+(value ?? 0),0);
  if (cents && (values.some(v=>v==null) || total<=0)) fail('Purchase costs are required on every line to allocate import expenses');
  const allocations=values.map((value,index)=>{
    const exact=total ? cents*(value ?? 0)/total : 0;
    return {index,cents:Math.floor(exact),remainder:exact-Math.floor(exact)};
  });
  let left=cents-allocations.reduce((sum,a)=>sum+a.cents,0);
  for (const a of [...allocations].sort((a,b)=>b.remainder-a.remainder || a.index-b.index)) {
    if (left--<=0) break;
    a.cents++;
  }
  return {total:cents/100, allocations:allocations.map(a=>a.cents/100)};
}

export async function convertImportItemTx(client,item) {
  const productName=String(item.productName || item.product_name || '').trim();
  if (!productName) fail('Product name is required');
  const config=(await client.query('SELECT * FROM stock_product_packs WHERE product_name=$1',[productName.toLowerCase()])).rows[0];
  const enteredUnit=String(item.enteredUnit || item.entered_unit || config?.base_unit || 'unit').trim().toLowerCase();
  const baseUnit=config?.base_unit || 'unit';
  const factor=enteredUnit===baseUnit ? 1 : config?.packs.find(p=>p.unit===enteredUnit)?.factor;
  if (!factor) fail(`Configure an explicit ${enteredUnit} conversion for ${productName}`);
  const enteredQuantity=Number(item.quantity);
  if (!Number.isSafeInteger(enteredQuantity) || enteredQuantity<=0 || !Number.isSafeInteger(enteredQuantity*factor))
    fail('Quantity must be a positive whole number within the supported range');
  const readCost=(camel,snake)=> {
    const value=nullableNumber(item[camel] ?? item[snake]);
    if (value!=null && (!Number.isFinite(value) || value<0)) fail(`${camel} must be a non-negative received cost or blank`);
    return value;
  };
  const cif=readCost('unitCIF','cif_unit_cost'),dp=readCost('unitDP','dpc_unit_value');
  if (!String(item.batchNo || item.batch_no || '').trim() || !/^\d{4}-\d{2}-\d{2}$/.test(item.expiryDate || item.expiry_date || ''))
    fail('Batch number and an ISO expiry date are required');
  return {productName,productId:item.productId || item.product_id || null,
    batchNo:String(item.batchNo || item.batch_no).trim(),expiryDate:item.expiryDate || item.expiry_date,
    enteredUnit,baseUnit,factor,enteredQuantity,quantity:enteredQuantity*factor,
    purchaseValue:cif==null ? null : cif*enteredQuantity,
    unitDP:dp==null ? null : dp/factor,metadata:item.metadata || {}};
}

export function sourceSnapshot(row) {
  return {...row,expiry_date:day(row.expiry_date),
    cif_unit_cost:nullableNumber(row.original_unit_cif ?? row.cif_unit_cost),
    dpc_unit_value:nullableNumber(row.original_unit_dp ?? row.dpc_unit_value)};
}

// Legacy aggregate rows remain unknown unless an exact frozen source is proven.
export function branchLayers(row, physicalBefore=Number(row.quantity)) {
  const meta=row.metadata || {};
  const layers=Array.isArray(meta.cost_layers) ? meta.cost_layers.map(layer=>({...layer,quantity:Number(layer.quantity)})) : [];
  if (!layers.length && !meta.provenance_conflict && meta.original_source?.id===row.source_batch_id)
    layers.push({quantity:physicalBefore,source:meta.original_source});
  const represented=layers.reduce((sum,layer)=>sum+layer.quantity,0);
  if (represented>physicalBefore+1e-7) fail('Cost layers exceed physical stock; review this batch before posting',409);
  if (represented<physicalBefore) layers.unshift({quantity:physicalBefore-represented,source:null});
  return layers;
}

export function takeLayers(layers,quantity) {
  let remaining=quantity;
  const taken=[];
  for (const layer of layers) {
    if (!remaining) break;
    const take=Math.min(remaining,layer.quantity);
    if (take>0) taken.push({quantity:take,source:layer.source});
    layer.quantity-=take; remaining-=take;
  }
  if (remaining>1e-7) fail('Source cost allocations are shorter than the physical transaction',409);
  return taken;
}

export async function allocateTransferTx(client,transfer,item,quantity) {
  const sourceType=inferLocationType(transfer.from_warehouse)==='branch' ? 'branch' : 'stock';
  const branch=sourceType==='branch';
  const aliases=branchSearchTerms(transfer.from_warehouse);
  const rows=(await client.query(branch ? `SELECT * FROM branch_inventory_batches
    WHERE LOWER(REPLACE(branch_id,' ','_'))=ANY($1) AND LOWER(TRIM(product_name))=LOWER(TRIM($2))
      AND ($3::text IS NULL OR batch_no=$3) AND ($4::date IS NULL OR expiry_date=$4::date)
      AND quantity>0 AND COALESCE(status,'in_stock') IN ('available','in_stock','active')
      AND (expiry_date IS NULL OR expiry_date >= (NOW() AT TIME ZONE 'Africa/Windhoek')::date)
    ORDER BY expiry_date NULLS LAST,id FOR UPDATE` : `SELECT * FROM stock_batches
    WHERE (location=$1 OR warehouse_id=$1) AND LOWER(TRIM(description))=LOWER(TRIM($2))
      AND ($3::text IS NULL OR batch_no=$3) AND ($4::date IS NULL OR expiry_date=$4::date)
      AND remaining_quantity>0 AND COALESCE(status,'available') IN ('available','in_stock','active')
      AND (expiry_date IS NULL OR expiry_date >= (NOW() AT TIME ZONE 'Africa/Windhoek')::date)
    ORDER BY expiry_date NULLS LAST,import_date NULLS LAST,id FOR UPDATE`,
    [branch ? aliases : transfer.from_warehouse,item.product_name,item.batch_no || null,day(item.expiry_date)])).rows;
  let remaining=quantity;
  for (const row of rows) {
    const take=Math.min(remaining,Number(branch ? row.quantity : row.remaining_quantity));
    if (!take) break;
    const layers=branch ? branchLayers(row) : [{quantity:take,source:sourceSnapshot(row)}];
    const taken=branch ? takeLayers(layers,take) : layers;
    if (branch) await client.query('UPDATE branch_inventory_batches SET quantity=quantity-$1,metadata=$2,updated_at=NOW() WHERE id=$3',
      [take,JSON.stringify({...row.metadata,cost_layers:layers.filter(l=>l.quantity>0)}),row.id]);
    else await client.query(`UPDATE stock_batches SET remaining_quantity=remaining_quantity-$1,
      dispatched_quantity=COALESCE(dispatched_quantity,0)+$1,updated_at=NOW() WHERE id=$2`,[take,row.id]);
    for (const layer of taken) await client.query(`INSERT INTO stock_transfer_allocations
      (id,transfer_id,line_id,source_type,source_id,quantity,snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [`TA-${randomUUID()}`,transfer.id,item.id,sourceType,row.id,layer.quantity,
        JSON.stringify({source:layer.source,product_name:item.product_name,batch_no:row.batch_no,expiry_date:day(row.expiry_date)})]);
    remaining-=take;
  }
  if (remaining) fail(`Insufficient eligible source stock for ${item.product_name}; short ${remaining}`);
}

export async function restoreTransferAllocationTx(client,item) {
  const rows=(await client.query('SELECT * FROM stock_transfer_allocations WHERE line_id=$1 ORDER BY allocation_order',[item.id])).rows;
  if (!rows.length) return false;
  const restoredBranchRows=new Set();
  for (const allocation of rows) {
    if (allocation.source_type==='stock') {
      const restored=await client.query(`UPDATE stock_batches SET
      remaining_quantity=remaining_quantity+$1,dispatched_quantity=dispatched_quantity-$1 WHERE id=$2`,
      [allocation.quantity,allocation.source_id]);
      if (!restored.rowCount) fail('Reserved source was removed; a reviewed correction is required',409);
    } else {
      if (restoredBranchRows.has(allocation.source_id)) continue;
      restoredBranchRows.add(allocation.source_id);
      const row=(await client.query('SELECT * FROM branch_inventory_batches WHERE id=$1 FOR UPDATE',[allocation.source_id])).rows[0];
      if (!row) fail('Reserved branch source is missing; a reviewed correction is required',409);
      const layers=branchLayers(row);
      const pieces=rows.filter(r=>r.source_type==='branch' && r.source_id===allocation.source_id);
      // Restore the consumed FIFO prefix in its original order, before newer
      // remaining/received layers, without changing source-row lock order.
      layers.unshift(...pieces.map(r=>({quantity:Number(r.quantity),source:r.snapshot.source})));
      await client.query('UPDATE branch_inventory_batches SET quantity=quantity+$1,metadata=$2 WHERE id=$3',
        [pieces.reduce((sum,r)=>sum+Number(r.quantity),0),JSON.stringify({...row.metadata,cost_layers:layers}),row.id]);
    }
  }
  return true;
}

export async function postAllocatedTransferMovementTx(client,transfer,item,type,actor) {
  const rows=(await client.query('SELECT * FROM stock_transfer_allocations WHERE line_id=$1 ORDER BY allocation_order',[item.id])).rows;
  if (!rows.length) return false; // Legacy reservations have no provable splits.
  for (const row of rows) {
    const source=row.snapshot.source;
    await client.query(`INSERT INTO stock_movements
      (id,product_name,batch_no,expiry_date,quantity,movement_type,source_location,source_location_type,
      destination_location,destination_location_type,reference_id,created_by,status,unit_dp,unit_cif,
      original_unit_dp,original_unit_cif,movement_date)
      VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,'posted',$13,$14,$13,$14,NOW())`,
      [`MOV-${randomUUID()}`,item.product_name,row.snapshot.batch_no,row.snapshot.expiry_date,row.quantity,type,
        transfer.from_warehouse,inferLocationType(transfer.from_warehouse),
        type==='reserved' ? transfer.to_branch : `in_transit:${transfer.id}`,type==='reserved' ? inferLocationType(transfer.to_branch) : 'in_transit',
        transfer.id,actor,source?.dpc_unit_value ?? null,source?.cif_unit_cost ?? null]);
  }
  return true;
}

// Slice a cumulative staff receipt against immutable dispatch allocations.
export function receiptSlice(allocations,before,quantity) {
  let skip=before,remaining=quantity;
  const pieces=[];
  for (const allocation of allocations) {
    const qty=Number(allocation.quantity);
    if (skip>=qty) { skip-=qty; continue; }
    const take=Math.min(remaining,qty-skip);
    if (take>0) pieces.push({...allocation,quantity:take});
    remaining-=take;skip=0;
    if (!remaining) break;
  }
  if (remaining) fail('Receipt has no matching dispatched cost allocation',409);
  return pieces;
}

export async function receiveAllocatedBranchTx(client,{transfer,line,allocations,before,quantity,branch,aliases,actor,hasTransit}) {
  const pieces=receiptSlice(allocations,before,quantity);
  for (const allocation of pieces) {
    const {source,batch_no,expiry_date}=allocation.snapshot;
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',
      [JSON.stringify(['stock-batch',branch,line.product_name.toLowerCase().trim(),batch_no || '',expiry_date || ''])]);
    const existing=(await client.query(`SELECT * FROM branch_inventory_batches WHERE LOWER(TRIM(branch_id))=ANY($1)
      AND LOWER(TRIM(product_name))=LOWER(TRIM($2)) AND batch_no IS NOT DISTINCT FROM $3
      AND expiry_date IS NOT DISTINCT FROM $4::date FOR UPDATE`,[aliases,line.product_name,batch_no,expiry_date])).rows[0];
    const layers=existing ? branchLayers(existing) : [];
    layers.push({quantity:Number(allocation.quantity),source});
    const unique=new Set(layers.map(l=>l.source?.id || 'unknown'));
    const original=unique.size===1 ? source : null;
    const metadata={...existing?.metadata,cost_layers:layers,original_source:original,
      provenance_conflict:unique.size>1,source_transfer_id:transfer.id};
    if (existing) await client.query(`UPDATE branch_inventory_batches SET quantity=quantity+$1,
      source_batch_id=$2,metadata=$3,updated_at=NOW() WHERE id=$4`,
      [allocation.quantity,original?.id || null,JSON.stringify(metadata),existing.id]);
    else await client.query(`INSERT INTO branch_inventory_batches
      (id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price,source_warehouse,source_batch_id,metadata,status)
      VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,'in_stock')`,
      [`BIB-${randomUUID()}`,branch,line.product_name,batch_no,expiry_date,allocation.quantity,
        source?.dpc_unit_value ?? null,transfer.from_warehouse,source?.id || null,JSON.stringify(metadata)]);
    await client.query(`INSERT INTO stock_movements
      (id,product_name,batch_no,expiry_date,quantity,movement_type,source_location,source_location_type,
      destination_location,destination_location_type,reference_id,created_by,status,unit_dp,unit_cif,original_unit_dp,original_unit_cif,movement_date)
      VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,'branch',$10,$11,'posted',$12,$13,$12,$13,NOW())`,
      [`RCPT-${randomUUID()}`,line.product_name,batch_no,expiry_date,allocation.quantity,
        hasTransit ? 'transit_receipt' : 'transfer_in',hasTransit ? `in_transit:${transfer.id}` : transfer.from_warehouse,
        hasTransit ? 'in_transit' : inferLocationType(transfer.from_warehouse),branch,transfer.id,actor,
        source?.dpc_unit_value ?? null,source?.cif_unit_cost ?? null]);
    await client.query(`INSERT INTO branch_inventory_movements
      (id,branch_id,type,product_name,batch_no,quantity,unit_price,reference,created_by)
      VALUES ($1,$2,'receive',$3,$4,$5,$6,$7,$8)`,
      [`BIM-${randomUUID()}`,branch,line.product_name,batch_no,allocation.quantity,source?.dpc_unit_value ?? null,transfer.id,actor]);
  }
}
