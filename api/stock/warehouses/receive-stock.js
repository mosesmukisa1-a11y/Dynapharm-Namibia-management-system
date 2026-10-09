import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../../db.js';
import { atomicStockRequest } from '../../_lib/atomicStockRequest.js';
import { postStockMovementTx, recomputeLocationBalances } from '../../services/stockEngine.js';
import { allocateTransferTx, restoreTransferAllocationTx, fail } from '../../services/stockCostLayers.js';

async function handler(req,res) {
  if (!req.user) return res.status(401).json({success:false,error:'Authentication required'});
  if (!['stock','stock_manager','warehouse','warehouse_manager','admin','superadmin','super_admin','gm'].includes(String(req.user.role).toLowerCase()))
    return res.status(403).json({success:false,error:'Warehouse receiving access required'});
  if (req.method!=='POST') return res.status(405).json({success:false,error:'Method not allowed'});
  const {transferId,action,rejectionReason}=req.body || {};
  if (!transferId || !['accept','reject'].includes(action)) fail('transferId and accept/reject action are required',400);
  const transfer=(await query('SELECT * FROM stock_transfers WHERE id=$1 FOR UPDATE',[transferId])).rows[0];
  if (!transfer) fail('Transfer not found',404);
  if (transfer.from_warehouse!=='country_stock' || !['windhoek_warehouse','ondangwa_warehouse'].includes(transfer.to_branch))
    fail('This receipt requires a Country Stock to Warehouse dispatch',400);
  if (action==='reject') {
    if (!['approved','pending_approval'].includes(transfer.status)) fail('Only an undispatched transfer may be rejected',409);
    await withTransaction(async client=>{
      const lines=(await client.query('SELECT * FROM stock_transfer_items WHERE transfer_id=$1 ORDER BY id FOR UPDATE',[transferId])).rows;
      for (const line of lines) await restoreTransferAllocationTx(client,line);
      await client.query("UPDATE stock_movements SET status='reversed',updated_at=NOW() WHERE reference_id=$1 AND movement_type='reserved' AND status='posted'",[transferId]);
    });
    await query("UPDATE stock_transfers SET status='rejected',dispatch_notes=$1,updated_at=NOW() WHERE id=$2",[rejectionReason || null,transferId]);
    await recomputeLocationBalances('country','country_stock');
    return res.json({success:true,action:'rejected',transferId});
  }
  if (!['approved','dispatched','in_transit'].includes(transfer.status) || !transfer.gm_approved_by)
    fail(`Cannot receive a transfer with status '${transfer.status}'; GM approval is required`,409);
  const actor=req.user.fullName || req.user.username || req.user.id;
  const lines=(await query('SELECT * FROM stock_transfer_items WHERE transfer_id=$1 ORDER BY id FOR UPDATE',[transferId])).rows;
  if (!lines.length) fail('Transfer has no lines',400);
  await withTransaction(async client=>{
    for (const line of lines) {
      let allocations=(await client.query('SELECT * FROM stock_transfer_allocations WHERE line_id=$1 ORDER BY allocation_order',[line.id])).rows;
      const qty=Number(line.quantity_approved ?? line.quantity);
      if (!Number.isSafeInteger(qty) || qty<=0) fail('Warehouse receipt needs positive whole base quantities');
      if (!allocations.length) {
        await allocateTransferTx(client,transfer,line,qty);
        allocations=(await client.query('SELECT * FROM stock_transfer_allocations WHERE line_id=$1 ORDER BY allocation_order',[line.id])).rows;
      }
      const transit=['dispatched','in_transit'].includes(transfer.status);
      for (const allocation of allocations) {
        const source=allocation.snapshot.source;
        if (!source) fail('Country source allocation is missing',409);
        const common={productName:line.product_name,batchNo:allocation.snapshot.batch_no,expiryDate:allocation.snapshot.expiry_date,
          quantity:Number(allocation.quantity),referenceId:transferId,unitDP:source.dpc_unit_value,unitCIF:source.cif_unit_cost,createdBy:actor};
        if (!transit) await postStockMovementTx(client,{...common,movementType:'transfer_out',
          sourceLocation:'country_stock',sourceLocationType:'country',destinationLocation:transfer.to_branch,destinationLocationType:'warehouse'});
        await postStockMovementTx(client,{...common,movementType:transit ? 'transit_receipt' : 'warehouse_receipt',
          sourceLocation:transit ? `in_transit:${transferId}` : 'country_stock',sourceLocationType:transit ? 'in_transit' : 'country',
          destinationLocation:transfer.to_branch,destinationLocationType:'warehouse'});
        const newBatchId=`WRECV-${randomUUID()}`;
        await client.query(`INSERT INTO stock_batches
          (id,barcode,description,batch_no,expiry_date,quantity,remaining_quantity,dispatched_quantity,
          import_date,location,warehouse_id,status,product_id,supplier_name,import_reference,supplier_import_id,
          dpc_unit_value,cif_unit_cost,dpc_total_value,cif_total_value,metadata,created_at,updated_at)
          VALUES ($1,$2,$3,$4,$5::date,$6,$6,0,$7,$8,$8,'available',$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),NOW())`,
          [newBatchId,`BC-${randomUUID()}`,line.product_name,common.batchNo,common.expiryDate,allocation.quantity,
            source.import_date || null,transfer.to_branch,source.product_id || null,source.supplier_name || null,
            source.import_reference || null,source.supplier_import_id || null,source.dpc_unit_value,source.cif_unit_cost,
            source.dpc_unit_value==null ? null : source.dpc_unit_value*Number(allocation.quantity),
            source.cif_unit_cost==null ? null : source.cif_unit_cost*Number(allocation.quantity),
            JSON.stringify({original_source:source,transfer_id:transferId,source_allocation_id:allocation.id})]);
        await client.query('UPDATE stock_batches SET original_unit_cif=$1,original_unit_dp=$2 WHERE id=$3',
          [source.received_unit_cif_exact ?? source.original_unit_cif ?? source.cif_unit_cost,source.dpc_unit_value,newBatchId]);
      }
      await client.query('UPDATE stock_transfer_items SET quantity_received=$1 WHERE id=$2',[qty,line.id]);
    }
    await client.query("UPDATE stock_transfers SET status='received',received_by=$1,received_at=NOW(),updated_at=NOW() WHERE id=$2",[actor,transferId]);
    await recomputeLocationBalances('country','country_stock');
    await recomputeLocationBalances('warehouse',transfer.to_branch);
    await recomputeLocationBalances('in_transit',`in_transit:${transferId}`);
  });
  return res.json({success:true,action:'accepted',transferId,warehouseId:transfer.to_branch,itemsReceived:lines.length});
}
export default atomicStockRequest(handler,['POST']);
