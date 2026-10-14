import { getMany } from '../db.js';
import { branchLayers, day, nullableNumber, sourceSnapshot } from './stockCostLayers.js';
import { ALL_BRANCH_LOCATION_ALIASES } from '../_lib/branchUtils.js';

// Read-only projection: never reconstruct physical stock from an incomplete ledger.
// Reservation quantities are held separately from the legacy available counters.
export async function getStockCostProjection(options={},read=getMany) {
  if(typeof options==='function'){read=options;options={};}
  const locations=options.locations?.map(v=>String(v).toLowerCase().trim()) ?? null;
  const product=options.productName?.toLowerCase().trim() ?? null;
  // One statement gives every source the same MVCC snapshot, including received
  // entitlements. Filters precede JSON materialization; no process-global cache.
  const [snapshot]=await read(`SELECT
    COALESCE((SELECT jsonb_agg(s) FROM stock_batches s WHERE remaining_quantity>0
      AND ($1::text[] IS NULL OR
        (location<>'' AND LOWER(TRIM(location))=ANY($1)) OR
        ((location IS NULL OR location='') AND LOWER(TRIM(warehouse_id))=ANY($1)))
      AND ($2::text IS NULL OR LOWER(TRIM(description))=LOWER(TRIM($2)))),'[]'::jsonb) AS stock,
    COALESCE((SELECT jsonb_agg(b) FROM branch_inventory_batches b WHERE quantity>0
      AND ($1::text[] IS NULL OR LOWER(TRIM(branch_id))=ANY($1))
      AND ($2::text IS NULL OR LOWER(TRIM(product_name))=LOWER(TRIM($2)))),'[]'::jsonb) AS branches,
    COALESCE((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('line_id',r.line_id::text) ORDER BY r.line_id,r.allocation_order) FROM (
      SELECT a.*,t.from_warehouse AS location,t.status,i.quantity_received
      FROM stock_transfer_allocations a JOIN stock_transfers t ON t.id=a.transfer_id
      JOIN stock_transfer_items i ON i.id=a.line_id
      WHERE t.status IN ('approved','dispatched','in_transit','partially_received')
      AND ($1::text[] IS NULL OR LOWER(TRIM(CASE WHEN t.status='approved' THEN t.from_warehouse
        ELSE 'in_transit:'||t.id END))=ANY($1))
      AND ($2::text IS NULL OR a.line_id IN (SELECT line_id FROM stock_transfer_allocations
        WHERE LOWER(TRIM(snapshot->>'product_name'))=LOWER(TRIM($2))))
    ) r),'[]'::jsonb) AS reservations,
    COALESCE((SELECT jsonb_agg(q) FROM stock_segregated_batches q WHERE quantity>0
      AND ($1::text[] IS NULL OR LOWER(TRIM(location))=ANY($1))
      AND ($2::text IS NULL OR LOWER(TRIM(snapshot->>'product_name'))=LOWER(TRIM($2)))),'[]'::jsonb) AS segregated`,
    [locations,options.productName?.trim() ?? null]);
  const {stock,branches,reservations,segregated}=snapshot;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Windhoek',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const rows=[];
  const add=({id,location,locationType,productName,batchNo,expiryDate,quantity,source,condition='saleable',reserved=false,transit=false})=>{
    const expired=expiryDate && expiryDate<today;
    const eligible=condition==='saleable' && !expired && !reserved && !transit;
    rows.push({id,location,locationType,productName,batchNo,expiryDate,condition,
      availableQty:eligible ? quantity : 0,reservedQty:reserved ? quantity : 0,
      onHandQty:transit ? 0 : quantity,inTransitQty:transit ? quantity : 0,
      quarantinedQty:condition!=='saleable' ? quantity : 0,expiredQty:expired ? quantity : 0,missingExpiry:!expiryDate,
      qty:quantity,unitCIF:nullableNumber(source?.cif_unit_cost),unitDPC:nullableNumber(source?.dpc_unit_value),
      missingCostQuantity:source?.cif_unit_cost==null ? quantity : 0,
      missingDPCQuantity:source?.dpc_unit_value==null ? quantity : 0,sourceBatchId:source?.id || null});
  };
  for (const row of stock.filter(r=>!options.branchOnly && !ALL_BRANCH_LOCATION_ALIASES.includes(String(r.location || '').toLowerCase()) && !String(r.location || '').endsWith('_branch'))) add({id:row.id,location:row.location || row.warehouse_id,locationType:row.location==='country_stock'?'country':'warehouse',productName:row.description,
    batchNo:row.batch_no,expiryDate:day(row.expiry_date),quantity:Number(row.remaining_quantity),source:sourceSnapshot(row),
    condition:['available','in_stock','active'].includes(row.status || 'available') ? 'saleable' : row.status});
  for (const row of branches) {
    for (const [index,layer] of branchLayers(row).entries()) add({id:`${row.id}:${index}`,location:row.branch_id,locationType:'branch',
      productName:row.product_name,batchNo:row.batch_no,expiryDate:day(row.expiry_date),quantity:layer.quantity,source:layer.source,
      condition:['available','in_stock','active'].includes(row.status || 'in_stock') ? 'saleable' : row.status});
  }
  // Remove cumulative received entitlements from transit, in allocation order.
  const received=new Map();
  for (const row of reservations) received.set(String(row.line_id),Number(row.quantity_received || 0));
  for (const row of reservations) {
    if(options.branchOnly && (row.source_kind ?? row.source_type)!=='branch')continue;
    const reserved=row.status==='approved',before=reserved ? 0 : received.get(String(row.line_id)) || 0;
    const quantity=Math.max(0,Number(row.quantity)-before);
    received.set(String(row.line_id),Math.max(0,before-Number(row.quantity)));
    if (quantity) add({id:row.id,location:reserved ? row.location : `in_transit:${row.transfer_id}`,locationType:!reserved?'in_transit':row.source_type==='branch'?'branch':row.location==='country_stock'?'country':'warehouse',
      productName:row.snapshot.product_name,batchNo:row.snapshot.batch_no,expiryDate:day(row.snapshot.expiry_date),
      quantity,source:row.snapshot.source,reserved,transit:!reserved});
  }
  for (const row of segregated.filter(r=>!options.branchOnly || r.source_type==='branch')) add({id:row.id,location:row.location,locationType:row.source_type==='branch'?'branch':row.location==='country_stock'?'country':'warehouse',productName:row.snapshot.product_name,
    batchNo:row.snapshot.batch_no,expiryDate:day(row.snapshot.expiry_date),quantity:Number(row.quantity),
    source:{id:row.snapshot.source_batch_id,cif_unit_cost:row.snapshot.unit_cost,dpc_unit_value:row.snapshot.unit_dp},
    condition:row.condition || 'quarantine'});
  return rows.filter(r=>!product || String(r.productName).toLowerCase().trim()===product);
}

export const salesEvidenceSql=`WITH evidence AS (
    SELECT a.movement_id,a.sale_reference,a.branch_id,a.product_name,a.batch_no,a.expiry_date,
      a.quantity,a.snapshot,COALESCE(sale.sale_date,sm.movement_date,a.created_at) AS created_at,
      a.movement_id::text AS allocation_id FROM stock_sale_allocations a
    JOIN stock_movements sm ON sm.id=a.movement_id AND sm.status IN ('posted','approved')
    LEFT JOIN branch_walkin_sales sale ON sale.id=a.sale_reference
    WHERE ($1::text[] IS NULL OR LOWER(TRIM(a.branch_id))=ANY($1))
      AND ($2::date IS NULL OR COALESCE(sale.sale_date,sm.movement_date,a.created_at) >= ($2::date::timestamp AT TIME ZONE 'Africa/Windhoek'))
       AND ($3::date IS NULL OR COALESCE(sale.sale_date,sm.movement_date,a.created_at) < (($3::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek'))
       AND ($4::text IS NULL OR LOWER(TRIM(a.product_name))=LOWER(TRIM($4)))
    UNION ALL
    SELECT sm.id AS movement_id,sm.reference_id AS sale_reference,
    sm.source_location AS branch_id,sm.product_name,sm.batch_no,sm.expiry_date,sm.quantity,
      jsonb_build_object('financial_dp_unit',sm.metadata->'sale_evidence'->'dp_unit_price',
        'revenue_total',sm.metadata->'sale_evidence'->'charged_value') AS snapshot,
      COALESCE(sale.sale_date,sm.movement_date,sm.created_at) AS created_at,'legacy:'||sm.id AS allocation_id
    FROM stock_movements sm LEFT JOIN stock_sale_allocations a ON a.movement_id=sm.id
    LEFT JOIN branch_walkin_sales sale ON sale.id=sm.reference_id
    WHERE a.movement_id IS NULL AND sm.status IN ('posted','approved')
      AND sm.movement_type IN ('walkin_sale','walkin_member_sale','walkin_non_member_sale','walk_in_member_sale',
        'walk_in_non_member_sale','prescription_dispense','campaign_sale','campaign_free_item','online_order_fulfilment')
      AND ($1::text[] IS NULL OR LOWER(TRIM(sm.source_location))=ANY($1))
      AND ($2::date IS NULL OR COALESCE(sale.sale_date,sm.movement_date,sm.created_at) >= ($2::date::timestamp AT TIME ZONE 'Africa/Windhoek'))
       AND ($3::date IS NULL OR COALESCE(sale.sale_date,sm.movement_date,sm.created_at) < (($3::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek'))
       AND ($4::text IS NULL OR LOWER(TRIM(sm.product_name))=LOWER(TRIM($4)))
  )`;
const salesSql=`${salesEvidenceSql}, valued AS (
    SELECT e.*,cost.known_cost,cost.missing_cost,
      COALESCE((snapshot->>'revenue_total')::numeric,(snapshot->>'revenue_unit')::numeric*quantity) AS revenue
    FROM evidence e CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(COALESCE((l->'source'->>'cif_unit_cost')::numeric,0)*(l->>'quantity')::numeric),0) AS known_cost,
        COALESCE(SUM(CASE WHEN l->'source'->>'cif_unit_cost' IS NULL THEN (l->>'quantity')::numeric ELSE 0 END),0) AS missing_cost
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(snapshot->'cost_layers')='array'
        THEN snapshot->'cost_layers' ELSE jsonb_build_array(jsonb_build_object('quantity',quantity,
          'source',jsonb_build_object('cif_unit_cost',snapshot->'unit_cost'))) END) l
    ) cost
  ) SELECT
    COALESCE((SELECT jsonb_agg(p ORDER BY created_at,movement_id,allocation_id) FROM
      (SELECT * FROM evidence ORDER BY created_at,movement_id,allocation_id LIMIT $5 OFFSET $6) p),'[]'::jsonb) AS rows,
    (SELECT COUNT(*) FROM evidence)::integer AS total,
    (SELECT jsonb_build_object('knownSalesCost',COALESCE(SUM(known_cost),0),
      'missingSalesCostQuantity',COALESCE(SUM(missing_cost),0),
      'knownSalesRevenue',COALESCE(SUM(revenue),0),
      'missingSalesRevenueQuantity',COALESCE(SUM(CASE WHEN revenue IS NULL THEN quantity ELSE 0 END),0),
      'grossProfit',CASE WHEN COUNT(*) FILTER(WHERE revenue IS NULL OR missing_cost>0)>0 THEN NULL
        ELSE COALESCE(SUM(revenue-known_cost),0) END) FROM valued) AS summary`;

export function mapSalesCostRows(rows) {
  return rows.map(row=>{
    const layers=row.snapshot.cost_layers || [{quantity:Number(row.quantity),source:{cif_unit_cost:row.snapshot.unit_cost,dpc_unit_value:row.snapshot.unit_dp}}];
    const revenue=row.snapshot.revenue_total!=null ? Number(row.snapshot.revenue_total) :
      row.snapshot.revenue_unit==null ? null : Number(row.snapshot.revenue_unit)*Number(row.quantity);
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

export async function getSalesCostPage({aliases,from,to,productName,limit=100,offset=0}={},read=getMany) {
  const [result]=await read(salesSql,[aliases?.map(v=>String(v).toLowerCase().trim()) || null,
    from || null,to || null,productName?.trim() || null,limit,offset]);
  return {...result,rows:mapSalesCostRows(result.rows)};
}

export async function getSalesCostReport(options={}) {
  return (await getSalesCostPage({...options,limit:null,offset:0})).rows;
}
