import {getMany} from '../db.js';
import {getStockCostProjection} from './stockCostReporting.js';
import {INWARD_TYPES,OUTWARD_TYPES,inferLocationType} from './stockEngine.js';
import {normalizeBranchSlug} from '../_lib/branchUtils.js';
import {day} from './stockCostLayers.js';

// Capture the canonical projection SQL without opening any connection or
// duplicating its source-layer/partial-receipt semantics.
export async function stockReconciliationSnapshotSql({compact=false}={}){
  let projection;
  await getStockCostProjection({},async sql=>{
    projection=sql;return [{stock:[],branches:[],reservations:[],segregated:[]}];
  });
  const sql=`SELECT (SELECT to_jsonb(p) FROM (${projection}) p) AS projection,
    COALESCE((SELECT jsonb_agg(b) FROM (SELECT location_id,location_type,product_name,batch_no,
      expiry_date,closing_qty,projection_version FROM inventory_balances LIMIT 20001) b),'[]'::jsonb) AS balances,
    COALESCE((SELECT jsonb_agg(m) FROM (SELECT product_name,batch_no,expiry_date,SUM(quantity) AS quantity,movement_type,
      source_location,destination_location,source_location_type,destination_location_type,
      COUNT(*) FILTER(WHERE reference_id IS NULL OR reference_id='') AS missing_reference_count,
      COUNT(*) AS movement_count FROM stock_movements WHERE status IN ('posted','approved')
      GROUP BY product_name,batch_no,expiry_date,movement_type,source_location,destination_location,
        source_location_type,destination_location_type
      LIMIT 50001) m),'[]'::jsonb) AS movements`;
  if(!compact)return sql;
  return `SELECT projection,
    COALESCE((SELECT jsonb_agg(jsonb_build_array(b->'location_id',b->'product_name',b->'batch_no',
      b->'expiry_date',b->'closing_qty',b->'projection_version'))
      FROM jsonb_array_elements(balances) b),'[]'::jsonb) AS "balanceTuples",
    COALESCE((SELECT jsonb_agg(jsonb_build_array(m->'product_name',m->'batch_no',m->'expiry_date',
      m->'quantity',m->'movement_type',m->'source_location',m->'destination_location',
      m->'source_location_type',m->'destination_location_type',m->'movement_count',m->'missing_reference_count'))
      FROM jsonb_array_elements(movements) m),'[]'::jsonb) AS "movementTuples"
    FROM (${sql}) snapshot`;
}
const kind=(value,type)=>['branch','warehouse','country','in_transit'].includes(type)?type:
  inferLocationType(String(value || '').replace(/^quarantine:/,''));
const location=(value,type)=>{
  const raw=String(value || '').replace(/^quarantine:/,'').trim().toLowerCase();
  return kind(raw,type)==='branch'?normalizeBranchSlug(raw):raw;
};
const key=(loc,product,batch,expiry,type)=>JSON.stringify([location(loc,type),kind(loc,type),String(product || '').trim().toLowerCase(),batch || '',day(expiry)]);
export async function buildStockReconciliation(snapshot,{environment='development'}={}){
  if(snapshot.balanceTuples)snapshot.balances=snapshot.balanceTuples.map(values=>Object.fromEntries(
    ['location_id','product_name','batch_no','expiry_date','closing_qty','projection_version'].map((name,i)=>[name,values[i]])));
  if(snapshot.movementTuples)snapshot.movements=snapshot.movementTuples.map(values=>Object.fromEntries(
    ['product_name','batch_no','expiry_date','quantity','movement_type','source_location','destination_location',
      'source_location_type','destination_location_type','movement_count','missing_reference_count'].map((name,i)=>[name,values[i]])));
  if(snapshot.balances.length>20000 || snapshot.movements.length>50000 ||
    ['stock','branches','reservations','segregated'].reduce((n,k)=>n+snapshot.projection[k].length,0)>20000)
    throw Error('Reconciliation exceeds the explicit safety limit; narrow scope before producing a report');
  const invalidLayerEvidence=[];
  const projection={...snapshot.projection,branches:snapshot.projection.branches.map(row=>{
    const represented=(row.metadata?.cost_layers || []).reduce((n,l)=>n+Number(l.quantity),0);
    if(represented<=Number(row.quantity)+1e-7)return row;
    invalidLayerEvidence.push({id:row.id,location:row.branch_id,product:row.product_name,
      recordedQuantity:row.quantity,layerQuantity:represented});
    // Diagnostic only, never persisted: retain actual quantity, explicitly
    // quarantine confidence in the inconsistent source/cost evidence.
    return {...row,metadata:{...row.metadata,cost_layers:[],original_source:null,provenance_conflict:true}};
  })};
  const layers=await getStockCostProjection({},async()=>[projection]);
  const stockIds=new Set(projection.stock.map(r=>r.id));
  const branchIds=projection.branches.map(r=>`${r.id}:`);
  const branchLocations=new Set(projection.branches.map(r=>String(r.branch_id).toLowerCase().trim()));
  const groups=new Map();
  const group=(loc,product,batch,expiry,type)=>{
    const id=key(loc,product,batch,expiry,type);
    if(!groups.has(id))groups.set(id,{location:location(loc,type),locationType:kind(loc,type),product,batch:batch || '',expiry:day(expiry),
      physicalQty:0,availableQty:0,reservedQty:0,quarantinedQty:0,expiredQty:0,inTransitQty:0,
      storedBalanceQty:null,movementNet:0,movementCount:0,missingSourceQty:0,missingCostQty:0,
      states:[],unknownMovementTypes:[],missingMovementReferences:0});
    return groups.get(id);
  };
  for(const layer of layers){
    const branch=branchIds.some(id=>String(layer.id).startsWith(id)) ||
      (!stockIds.has(layer.id) && branchLocations.has(String(layer.location).toLowerCase().trim()));
    const row=group(layer.location,layer.productName,layer.batchNo,layer.expiryDate,
      layer.locationType || (branch?'branch':undefined));
    for(const name of ['availableQty','reservedQty','quarantinedQty','expiredQty','inTransitQty'])row[name]+=Number(layer[name] || 0);
    row.physicalQty+=Number(layer.qty);
    if(!layer.sourceBatchId)row.missingSourceQty+=layer.qty;
    row.missingCostQty+=layer.missingCostQuantity;
    row.states.push({condition:layer.condition,quantity:layer.qty,onHandQty:layer.onHandQty,
      availableQty:layer.availableQty,reservedQty:layer.reservedQty,inTransitQty:layer.inTransitQty,
      sourceBatchId:layer.sourceBatchId,unitCIF:layer.unitCIF,missingExpiry:layer.missingExpiry});
  }
  for(const balance of snapshot.balances){
    const row=group(balance.location_id,balance.product_name,balance.batch_no,balance.expiry_date,balance.location_type);
    row.storedBalanceQty=(row.storedBalanceQty ?? 0)+Number(balance.closing_qty);
    row.legacyCache=(row.legacyCache || balance.projection_version!==1);
  }
  const ownedLocations=new Set([...groups.values()].map(r=>r.location));
  const external=new Set(['customer','supplier','external','consumed','written_off','field_use','dispensed']);
  for(const movement of snapshot.movements){
    if(movement.movement_type==='reserved')continue;
    const src=location(movement.source_location,movement.source_location_type),dst=location(movement.destination_location,movement.destination_location_type);
    if(src && src===dst)continue; // condition/internal relocation, not consumption
    for(const [loc,type,inward] of [[dst,movement.destination_location_type,true],[src,movement.source_location_type,false]]){
      if(!loc || external.has(loc) || type==='external')continue;
      if(!ownedLocations.has(loc) && !['branch','country','warehouse','in_transit','quarantine'].includes(type))continue;
      const row=group(loc,movement.product_name,movement.batch_no,movement.expiry_date,type);
      const classified=(inward?INWARD_TYPES:OUTWARD_TYPES).has(movement.movement_type);
      if(classified)row.movementNet+=Number(movement.quantity)*(inward?1:-1);
      else if(!row.unknownMovementTypes.includes(movement.movement_type))row.unknownMovementTypes.push(movement.movement_type);
      row.movementCount+=Number(movement.movement_count || 1);
      row.missingMovementReferences+=Number(movement.missing_reference_count || 0);
    }
  }
  const rows=[...groups.values()].filter(r=>r.physicalQty || r.storedBalanceQty!=null || r.movementNet || r.unknownMovementTypes.length).map(row=>({...row,
    projectionMinusStored:row.storedBalanceQty==null?null:row.physicalQty-row.storedBalanceQty,
    projectionMinusMovements:row.physicalQty-row.movementNet,
    historyCompleteness:'UNVERIFIED: no certified opening baseline or physical count'}))
    .sort((a,b)=>JSON.stringify([a.location,a.product,a.batch,a.expiry]).localeCompare(JSON.stringify([b.location,b.product,b.batch,b.expiry])));
  return {generatedAt:new Date().toISOString(),environment,readOnly:true,
    reconciliationStatus:'PARTIALLY VERIFIED',physicalCountStatus:'UNVERIFIED',rows,invalidLayerEvidence,
    summary:{rows:rows.length,recordedOwnedQty:rows.reduce((n,r)=>n+r.physicalQty,0),
      reservations:rows.reduce((n,r)=>n+r.reservedQty,0),inTransit:rows.reduce((n,r)=>n+r.inTransitQty,0),
      storedBalanceDifferences:rows.filter(r=>r.projectionMinusStored!==null && Math.abs(r.projectionMinusStored)>0.000001).length,
      historyDifferences:rows.filter(r=>Math.abs(r.projectionMinusMovements)>0.000001).length,
      missingSourceQty:rows.reduce((n,r)=>n+r.missingSourceQty,0),missingCostQty:rows.reduce((n,r)=>n+r.missingCostQty,0)},
    limitations:['Differences require evidence review, not automatic balance repair.',
      'A zero difference does not prove ledger completeness or physical-count accuracy.',
      'Physical totals include transit; status columns (especially expired/quarantined) may overlap.',
      'Source IDs alone do not certify invoices, import expenses, or supplier provenance.']};
}
export async function getStockReconciliation(read=getMany,options={}){
  const [snapshot]=await read(await stockReconciliationSnapshotSql(),[null,null]);
  return buildStockReconciliation(snapshot,options);
}
