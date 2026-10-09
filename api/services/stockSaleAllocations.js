import { normalizeBranchSlug, branchSearchTerms } from '../_lib/branchUtils.js';
// Server-recorded sale evidence, not a join to whatever lot happens to remain.
// Physical/source IDs are intentionally historical strings: depleted rows may
// disappear, but that must not change the supplier identity of the original sale.
export const saleAllocationSchema = `CREATE TABLE IF NOT EXISTS stock_sale_allocations (
  movement_id TEXT PRIMARY KEY REFERENCES stock_movements(id) ON DELETE CASCADE,
  sale_reference TEXT NOT NULL, branch_batch_id TEXT NOT NULL, branch_id TEXT NOT NULL,
  product_name TEXT NOT NULL, batch_no TEXT, expiry_date DATE, quantity NUMERIC NOT NULL CHECK (quantity>0),
  snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;
const date = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10) || null;
const equal = (a,b) => String(a || '').trim().toLowerCase()===String(b || '').trim().toLowerCase();

export async function recordBranchSaleAllocationTx(client, {movementId,saleReference,batchId,quantity}) {
  await client.query(saleAllocationSchema);
  const row=(await client.query('SELECT * FROM branch_inventory_batches WHERE id=$1',[batchId])).rows[0];
  if (!row) throw new Error('Locked sale batch identity was lost');
  let source=null;
  if (row.source_batch_id) source=(await client.query('SELECT * FROM stock_batches WHERE id=$1',[row.source_batch_id])).rows[0];
  const frozen=row.metadata?.original_source;
  if (frozen && frozen.id===row.source_batch_id) source=frozen;
  if (row.metadata?.provenance_conflict || !source || !equal(source.description,row.product_name)
    || source.batch_no!==row.batch_no || date(source.expiry_date)!==date(row.expiry_date)) source=null;
  const snapshot={
    id:row.id,batch_type:'branch',location:row.branch_id,product_name:row.product_name,batch_no:row.batch_no,
    expiry_date:date(row.expiry_date),quantity:Number(quantity),source_batch_id:source?.id || null,
    supplier_import_id:source?.supplier_import_id || null,supplier_name:source?.supplier_name || null,
    unit_cost:source?.cif_unit_cost == null ? null : Number(source.cif_unit_cost),
    unit_dp:source?.dpc_unit_value == null ? null : Number(source.dpc_unit_value),
    original_source:source ? {...source,expiry_date:date(source.expiry_date)} : null,
    status:'in_stock',condition:'saleable',
  };
  await client.query(`INSERT INTO stock_sale_allocations
    (movement_id,sale_reference,branch_batch_id,branch_id,product_name,batch_no,expiry_date,quantity,snapshot)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [movementId,saleReference,row.id,row.branch_id,row.product_name,row.batch_no,date(row.expiry_date),quantity,JSON.stringify(snapshot)]);
  return snapshot;
}

export async function refundSourceSnapshotTx(client,refund,expiry) {
  await client.query(saleAllocationSchema);
  const branch=normalizeBranchSlug(refund.branch_id) || refund.branch_id;
  const aliases=[...new Set([branch,refund.branch_id,...branchSearchTerms(branch)].map(value=>String(value).toLowerCase().trim()))];
  const params=[refund.sale_reference,refund.product_name,refund.batch_no,date(expiry),aliases];
  const allocations=refund.sale_reference ? (await client.query(`SELECT a.snapshot,a.quantity FROM stock_sale_allocations a
    JOIN stock_movements sm ON sm.id=a.movement_id AND sm.status IN ('posted','approved')
    WHERE a.sale_reference=$1 AND LOWER(TRIM(a.product_name))=LOWER(TRIM($2))
      AND COALESCE(a.batch_no,'')=COALESCE($3,'') AND a.expiry_date IS NOT DISTINCT FROM $4::date
      AND LOWER(TRIM(a.branch_id))=ANY($5::text[])`,params)).rows : [];
  if (allocations.length) {
    const prior=(await client.query(`SELECT COALESCE(SUM(quantity),0) AS quantity FROM branch_refund_requests
      WHERE sale_reference=$1 AND LOWER(TRIM(product_name))=LOWER(TRIM($2))
        AND COALESCE(batch_no,'')=COALESCE($3,'') AND LOWER(TRIM(branch_id))=ANY($4::text[])
        AND status='approved' AND id<>$5`,
      [refund.sale_reference,refund.product_name,refund.batch_no,aliases,refund.id])).rows[0];
    if (Number(prior.quantity)+Number(refund.quantity)>allocations.reduce((sum,a)=>sum+Number(a.quantity),0))
      throw Object.assign(new Error('Cumulative returned quantity exceeds recorded original sale allocations'),{statusCode:400});
    const identities=new Set(allocations.map(a=>JSON.stringify([
      a.snapshot.source_batch_id,a.snapshot.supplier_import_id,a.snapshot.unit_cost,
    ])));
    if (identities.size===1) return {...allocations[0].snapshot,location:branch,
      refund_reference:refund.id,release_without_source:true};
  }
  // Legacy evidence may establish a cost, but not a supplier. A currently
  // matching available lot is never proof of which original layer was sold.
  const costs=refund.sale_reference ? (await client.query(`SELECT DISTINCT unit_cif,unit_dp FROM stock_movements
    WHERE reference_id=$1 AND LOWER(TRIM(product_name))=LOWER(TRIM($2))
      AND COALESCE(batch_no,'')=COALESCE($3,'') AND expiry_date IS NOT DISTINCT FROM $4::date
      AND LOWER(TRIM(source_location))=ANY($5::text[]) AND status IN ('posted','approved')
      AND movement_type IN ('walkin_sale','walk_in_member_sale','walk_in_non_member_sale','campaign_sale','prescription_dispense','sale')`,params)).rows : [];
  return {id:refund.id,batch_type:'branch',location:branch,product_name:refund.product_name,batch_no:refund.batch_no,
    expiry_date:date(expiry),quantity:0,source_batch_id:null,supplier_import_id:null,supplier_name:null,
    unit_cost:costs.length===1 && costs[0].unit_cif!=null ? Number(costs[0].unit_cif) : null,
    unit_dp:costs.length===1 && costs[0].unit_dp!=null ? Number(costs[0].unit_dp) : null,
    status:'quarantine',release_without_source:true,refund_reference:refund.id};
}

export async function preserveRestoredProvenanceTx(client,{batchId,snapshot,receivedQuantity=0}) {
  const row=(await client.query('SELECT * FROM branch_inventory_batches WHERE id=$1 FOR UPDATE',[batchId])).rows[0];
  const previousQuantity=Number(row.quantity)-Number(receivedQuantity);
  const prior=row.metadata || {};
  let priorSource=prior.original_source;
  if (!priorSource && row.source_batch_id)
    priorSource=(await client.query('SELECT * FROM stock_batches WHERE id=$1',[row.source_batch_id])).rows[0];
  const verified=priorSource && priorSource.id===row.source_batch_id && equal(priorSource.description,row.product_name)
    && priorSource.batch_no===row.batch_no && date(priorSource.expiry_date)===date(row.expiry_date);
  const numeric=v=>v==null ? null : Number(v);
  const mixed=previousQuantity>0 && (prior.provenance_conflict || !row.source_batch_id
    || !verified || row.source_batch_id!==snapshot.source_batch_id
    || priorSource.supplier_import_id!==snapshot.supplier_import_id
    || numeric(priorSource.cif_unit_cost)!==numeric(snapshot.unit_cost));
  const metadata={...prior,provenance_conflict:Boolean(mixed),
    original_source:mixed ? null : snapshot.original_source || null,
    cif_unit_cost:mixed ? null : snapshot.unit_cost,unit_cif:mixed ? null : snapshot.unit_cost,
    supplier_import_id:mixed ? null : snapshot.supplier_import_id,
    supplier_name:mixed ? null : snapshot.supplier_name,customer_return_reference:snapshot.refund_reference};
  if (mixed) metadata.prior_original_source=prior.prior_original_source || priorSource || {
    source_batch_id:row.source_batch_id,quantity:previousQuantity,unverified:!row.source_batch_id,
  };
  await client.query('UPDATE branch_inventory_batches SET source_batch_id=$1,metadata=$2,updated_at=NOW() WHERE id=$3',
    [mixed ? null : snapshot.source_batch_id,JSON.stringify(metadata),batchId]);
}
