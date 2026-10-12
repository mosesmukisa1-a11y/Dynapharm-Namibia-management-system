import {createHash} from 'node:crypto';
import {getMany, getOne, query} from '../db.js';
import {normalizeBranchSlug} from '../_lib/branchUtils.js';

const key = value => String(value || '').trim().toLowerCase();
const day = value => value ? new Date(value).toISOString().slice(0,10) : '';
const lotKey = (name,batch,expiry) => JSON.stringify([key(name),batch || '',day(expiry)]);
export function distributionError(message, statusCode=400) {
  return Object.assign(new Error(message), {statusCode});
}
export function authorizeCountryDistribution(user) {
  if(!user) throw distributionError('Authentication required',401);
  if(!['stock','stock_manager','gm','general_manager','director','admin','superadmin','super_admin'].includes(key(user.role)))
    throw distributionError('Country stock distribution access required',403);
  // Branch-assigned stock managers cannot manage national stock.
  if(key(user.role)==='stock_manager' && normalizeBranchSlug(user.branch || '')!=='country_stock')
    throw distributionError('Country stock is outside your assigned location',403);
}

export async function distributionCatalog(user) {
  authorizeCountryDistribution(user);
  const [records, prices, batches, commitments, warehouses] = await Promise.all([
    getMany('SELECT id,sku,name,unit,is_active FROM products ORDER BY name,id'),
    getMany('SELECT id,description,product_code FROM live_product_prices WHERE catalogue_entry ORDER BY description,id'),
    getMany(`SELECT id,product_id,description,barcode,batch_no,expiry_date,remaining_quantity,metadata
      FROM stock_batches WHERE (location='country_stock' OR warehouse_id='country_stock')
      AND remaining_quantity>0 AND COALESCE(status,'available') IN ('available','active','in_stock')
      AND (expiry_date IS NULL OR expiry_date >= (NOW() AT TIME ZONE 'Africa/Windhoek')::date)
      ORDER BY expiry_date NULLS LAST,import_date NULLS LAST,id`),
    getMany(`SELECT LOWER(TRIM(i.product_name)) AS name,i.batch_no,i.expiry_date,
      SUM(GREATEST(COALESCE(i.quantity_approved,i.quantity)-COALESCE(a.qty,0),0)) AS qty
      FROM stock_transfer_items i JOIN stock_transfers t ON t.id=i.transfer_id
      LEFT JOIN (SELECT line_id,SUM(quantity) qty FROM stock_transfer_allocations GROUP BY line_id) a ON a.line_id=i.id
      WHERE t.from_warehouse='country_stock'
      AND t.status IN ('draft','prepared','pending','pending_approval','awaiting_gm','approved','dispatched','in_transit','partially_received')
      GROUP BY LOWER(TRIM(i.product_name)),i.batch_no,i.expiry_date`),
    getMany(`SELECT id,name FROM warehouse_locations WHERE type='warehouse'
      AND COALESCE(status,'active') NOT IN ('inactive','disabled','closed') ORDER BY name,id`),
  ]);
  // This is display enrichment only: preserve every stored product ID and SKU.
  // A unique exact-name price row supplies a second code, never rewrites a record.
  const products=records.map(p=>{
    const matches=prices.filter(row=>key(row.description)===key(p.name));
    return {...p,sku:p.sku || '',catalogueCode:matches.length===1?matches[0].product_code:null};
  });
  for(const p of prices) {
    if(!records.some(row=>key(row.name)===key(p.description)))
      products.push({id:`pl-${p.id}`,name:p.description,sku:p.product_code || '',unit:'units',is_active:true});
    else if(prices.filter(row=>key(row.description)===key(p.description)).length>1)
      products.push({id:`pl-${p.id}`,name:p.description,sku:p.product_code || '',unit:'units',is_active:true});
  }
  const pending=new Map();
  for(const row of commitments) pending.set(row.name,(pending.get(row.name) || 0)+Number(row.qty));
  for(const p of products) {
    const sameName=products.filter(row=>key(row.name)===key(p.name));
    const matching=batches.filter(b=>key(b.description)===key(p.name));
    const ambiguous=sameName.length>1;
    p.available=ambiguous || p.is_active===false ? 0 : Math.max(0,matching.reduce((n,b)=>n+Number(b.remaining_quantity),0)-(pending.get(key(p.name)) || 0));
    p.barcode=matching.map(b=>b.barcode).filter(Boolean).join(' ');
    p.unit=p.unit || 'units';
    p.unavailableReason=ambiguous?'Multiple product IDs share this name; stock identity needs review':
      p.is_active===false?'Product is inactive':p.available<=0?'No eligible uncommitted country stock':'';
  }
  return {products,warehouses,batches,commitments};
}

// Called inside atomicStockRequest: serialize commitments and retry keys on the
// same transaction that inserts transfer + lines. No physical movement on create.
export async function prepareCountryDistribution(body, user) {
  authorizeCountryDistribution(user);
  await query("SELECT pg_advisory_xact_lock(hashtext('country-distribution-create'))");
  const rawItems=body.items ?? body.itemsArray;
  if(!Array.isArray(rawItems) || !rawItems.length) throw distributionError('Add at least one product');
  const destination=body.to_location || body.toBranch || body.to_branch || body.toWarehouse || body.to_warehouse;
  if(new Set([body.to_location,body.toBranch,body.to_branch,body.toWarehouse,body.to_warehouse].filter(Boolean)).size>1)
    throw distributionError('Conflicting destination fields');
  const operationKey=body.operation_key || body.id || null;
  if(operationKey && (typeof operationKey!=='string' || operationKey.length>160))
    throw distributionError('Invalid transfer submission key');
  const fingerprint=createHash('sha256').update(JSON.stringify({
    destination,items:rawItems,note:body.dispatchNotes || body.dispatch_notes || '',
    actor:user.id || user.userId || user.username,
  })).digest('hex');
  if(operationKey) {
    const existing=await getOne(`SELECT id,metadata FROM stock_transfers
      WHERE from_warehouse='country_stock' AND metadata->>'distribution_operation_key'=$1`,[operationKey]);
    if(existing) {
      if(existing.metadata?.distribution_fingerprint!==fingerprint)
        throw distributionError('This submission key was already used for a different transfer',409);
      return {existingId:existing.id};
    }
  }
  const {products,warehouses,batches,commitments}=await distributionCatalog(user);
  if(!warehouses.some(w=>w.id===destination)) throw distributionError('Select an active destination warehouse');
  const requested=new Map();
  for(const item of rawItems) {
    const quantity=Number(item.quantity ?? item.qty);
    if(!Number.isSafeInteger(quantity) || quantity<=0) throw distributionError('Quantities must be positive whole numbers');
    const id=item.productId || item.product_id;
    // Preserve old country-stock callers, but accept name-only input only when
    // it resolves to exactly one real catalogue identity.
    const matches=id?products.filter(p=>String(p.id)===String(id)):
      products.filter(p=>key(p.name)===key(item.productName || item.product_name));
    if(matches.length!==1) throw distributionError('Product ID is invalid or its identity is ambiguous');
    const product=matches[0];
    if(item.productName && key(item.productName)!==key(product.name))
      throw distributionError('Product ID and name do not match');
    const batchNo=item.batchNo || item.batch_no || null;
    const expiryDate=item.expiryDate || item.expiry_date || null;
    if(expiryDate && !Number.isFinite(Date.parse(expiryDate))) throw distributionError('Invalid expiry date');
    const requestKey=JSON.stringify([product.id,batchNo,expiryDate]);
    const entry=requested.get(requestKey) || {product,quantity:0,batchNo,expiryDate};
    entry.quantity+=quantity;
    if(!Number.isSafeInteger(entry.quantity)) throw distributionError('Quantity exceeds the supported range');
    requested.set(requestKey,entry);
  }
  const items=[];
  const totals=new Map();
  for(const {product,quantity} of requested.values()) {
    totals.set(product.id,(totals.get(product.id) || 0)+quantity);
    if(totals.get(product.id)>product.available) throw distributionError(`${product.name}: insufficient uncommitted stock`,409);
  }
  const pendingLots=new Map(commitments.map(c=>[lotKey(c.name,c.batch_no,c.expiry_date),Number(c.qty)]));
  const freeBatches=batches.map(b=>{
    const k=lotKey(b.description,b.batch_no,b.expiry_date);
    const held=pendingLots.get(k) || 0;
    const withheld=Math.min(held,Number(b.remaining_quantity));
    pendingLots.set(k,held-withheld);
    return {...b,free:Number(b.remaining_quantity)-withheld};
  });
  // Old requests may lack a batch/expiry or reference an exhausted lot. They
  // still commit units; withhold that remainder before offering other lots.
  for(const c of commitments) {
    const k=lotKey(c.name,c.batch_no,c.expiry_date);
    let remainder=pendingLots.get(k) || 0;
    for(const b of freeBatches.filter(b=>key(b.description)===c.name)) {
      const withheld=Math.min(remainder,b.free);
      b.free-=withheld;
      remainder-=withheld;
    }
    pendingLots.set(k,remainder);
  }
  for(const {product,quantity,batchNo,expiryDate} of requested.values()) {
    if(quantity>product.available) throw distributionError(`${product.name}: requested ${quantity}, available ${product.available}. ${product.unavailableReason}`,409);
    // Persist exact FEFO lots rather than enriching the whole requested quantity
    // with only the first lot's expiry. Approval still performs physical allocation.
    const matches=freeBatches.filter(b=>key(b.description)===key(product.name)
      && (!batchNo || b.batch_no===batchNo) && (!expiryDate || day(b.expiry_date)===day(expiryDate)));
    let remaining=quantity;
    for(const b of matches) {
      const take=Math.min(remaining,b.free);
      if(take>0) items.push({productId:product.id,productName:product.name,quantity:take,
        batchNo:b.batch_no,expiryDate:b.expiry_date,unit:product.unit});
      remaining-=take;
      b.free-=take;
      if(!remaining) break;
    }
    if(remaining) throw distributionError('Available stock changed; refresh and retry',409);
  }
  return {items,metadata:{...(body.metadata || {}),
    distribution_operation_key:operationKey,distribution_fingerprint:fingerprint}};
}
