import {getMany} from '../db.js';
import {salesEvidenceSql} from './stockCostReporting.js';
import {validateBusinessDates} from './businessDates.js';

// DP is distributor selling price, NOT received CIF cost or consumer receipts.
// Preserve NUMERIC totals as strings in downloadable financial reconciliation.
export async function getSalesReturnsSummary({aliases,from,to,productName}={},read=getMany){
  validateBusinessDates(from,to);
  const [result]=await read(`${salesEvidenceSql}, events AS (
    SELECT 'sale' AS kind,e.quantity,e.snapshot,
      COALESCE((e.snapshot->>'revenue_total')::numeric,(e.snapshot->>'revenue_unit')::numeric*e.quantity) AS revenue,
      CASE WHEN (LOWER(s.customer_type) LIKE '%member%' AND LOWER(s.customer_type) NOT LIKE '%non%')
          OR LOWER(s.customer_type) LIKE '%online%'
        THEN COALESCE((e.snapshot->>'revenue_total')::numeric,(e.snapshot->>'revenue_unit')::numeric*e.quantity)
        ELSE (e.snapshot->>'financial_dp_unit')::numeric*e.quantity*(1-COALESCE((s.data->>'discount_pct')::numeric,0)/100) END AS original_dp
    FROM evidence e LEFT JOIN branch_walkin_sales s ON s.id=e.sale_reference
    UNION ALL
    SELECT 'refund',r.quantity,COALESCE(rev.snapshot,'{}'::jsonb),r.refund_amount,
      CASE WHEN (LOWER(s.customer_type) LIKE '%member%' AND LOWER(s.customer_type) NOT LIKE '%non%')
          OR LOWER(s.customer_type) LIKE '%online%' THEN r.refund_amount
        ELSE (rev.snapshot->>'financial_dp_unit')::numeric*r.quantity*(1-COALESCE((s.data->>'discount_pct')::numeric,0)/100) END
    FROM branch_refund_requests r
    LEFT JOIN stock_linked_reversals rev ON rev.id=r.movement_id AND rev.kind='customer'
    LEFT JOIN branch_walkin_sales s ON s.id=r.sale_reference
    WHERE r.status='approved'
      AND ($1::text[] IS NULL OR LOWER(TRIM(r.branch_id))=ANY($1))
      AND ($2::date IS NULL OR r.processed_at>=($2::date::timestamp AT TIME ZONE 'Africa/Windhoek'))
      AND ($3::date IS NULL OR r.processed_at<(($3::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek'))
      AND ($4::text IS NULL OR LOWER(TRIM(r.product_name))=LOWER(TRIM($4)))
  ), unmatched_receipts AS (
    SELECT COUNT(*)::text AS records,COALESCE(SUM(s.total),0)::text AS charged
    FROM branch_walkin_sales s WHERE s.status='completed'
      AND ($1::text[] IS NULL OR LOWER(TRIM(s.branch_id))=ANY($1))
      AND ($2::date IS NULL OR s.sale_date>=($2::date::timestamp AT TIME ZONE 'Africa/Windhoek'))
      AND ($3::date IS NULL OR s.sale_date<(($3::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek'))
      AND ($4::text IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(s.items)='array' THEN s.items ELSE '[]'::jsonb END) item
        WHERE LOWER(TRIM(COALESCE(item->>'name',item->>'product_name',item->>'description')))=LOWER(TRIM($4))))
      AND NOT EXISTS(SELECT 1 FROM stock_movements sm WHERE sm.reference_id=s.id
        AND sm.status IN ('posted','approved') AND (sm.movement_type LIKE '%sale%' OR sm.movement_type='prescription_dispense'))
  ), valued AS (
    SELECT e.*, original_dp AS dp,
      cost.known_cost,
      CASE WHEN cost.represented IS DISTINCT FROM quantity THEN quantity ELSE cost.missing END AS missing_cost
    FROM events e CROSS JOIN LATERAL (
      SELECT COALESCE(SUM((l->>'quantity')::numeric),0) AS represented,
        COALESCE(SUM(COALESCE((l->'source'->>'cif_unit_cost')::numeric,0)*(l->>'quantity')::numeric),0) AS known_cost,
        COALESCE(SUM(CASE WHEN l->'source'->>'cif_unit_cost' IS NULL THEN (l->>'quantity')::numeric ELSE 0 END),0) AS missing
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(snapshot->'cost_layers')='array'
        THEN snapshot->'cost_layers' ELSE jsonb_build_array(jsonb_build_object('quantity',quantity,
          'source',jsonb_build_object('cif_unit_cost',snapshot->'unit_cost'))) END) l
    ) cost
  ) SELECT (SELECT records FROM unmatched_receipts) AS "unmatchedSaleRecords",
    (SELECT charged FROM unmatched_receipts) AS "unmatchedReceiptAmount",
    COALESCE(SUM(quantity) FILTER(WHERE kind='sale'),0)::text AS "grossSoldQuantity",
    COALESCE(SUM(quantity) FILTER(WHERE kind='refund'),0)::text AS "returnedQuantity",
    COALESCE(SUM(CASE WHEN kind='sale' THEN quantity ELSE -quantity END),0)::text AS "netSoldQuantity",
    COALESCE(SUM(revenue) FILTER(WHERE kind='sale'),0)::text AS "grossSalesRevenue",
    COALESCE(SUM(revenue) FILTER(WHERE kind='refund'),0)::text AS "refunds",
    COALESCE(SUM(CASE WHEN kind='sale' THEN revenue ELSE -revenue END),0)::text AS "netSalesRevenue",
    COALESCE(SUM(known_cost) FILTER(WHERE kind='sale'),0)::text AS "grossCostOfGoodsSold",
    COALESCE(SUM(known_cost) FILTER(WHERE kind='refund'),0)::text AS "returnedOriginalCost",
    COALESCE(SUM(CASE WHEN kind='sale' THEN known_cost ELSE -known_cost END),0)::text AS "netCostOfGoodsSold",
    COALESCE(SUM(dp) FILTER(WHERE kind='sale'),0)::text AS "grossSalesDP",
    COALESCE(SUM(dp) FILTER(WHERE kind='refund'),0)::text AS "refundsDP",
    COALESCE(SUM(CASE WHEN kind='sale' THEN dp ELSE -dp END),0)::text AS "netSalesDP",
    COALESCE(SUM(missing_cost),0)::text AS "missingFinancialCostQuantity",
    COALESCE(SUM(CASE WHEN revenue IS NULL THEN quantity ELSE 0 END),0)::text AS "missingFinancialRevenueQuantity",
    COALESCE(SUM(CASE WHEN dp IS NULL THEN quantity ELSE 0 END),0)::text AS "missingFinancialDPQuantity",
    CASE WHEN COUNT(*) FILTER(WHERE missing_cost>0 OR revenue IS NULL)=0 THEN
      COALESCE(SUM(CASE WHEN kind='sale' THEN revenue-known_cost ELSE known_cost-revenue END),0)::text
      END AS "grossProfitAfterReturns"
    FROM valued`,[aliases?.map(v=>String(v).toLowerCase().trim()) || null,from || null,to || null,productName || null]);
  const unmatched=Number(result.unmatchedSaleRecords)>0;
  return {...result,grossProfitAfterReturns:unmatched?null:result.grossProfitAfterReturns,
    revenueBasis:'Matched original amounts charged; approved refunds recognised on approval date; unmatched receipts disclosed separately',
    dpDefinition:'DP = distributor selling price after the original recorded discount; separate from customer receipts and received CIF cost',
    timezone:'Africa/Windhoek',financialComplete:!unmatched && Number(result.missingFinancialCostQuantity)===0 &&
      Number(result.missingFinancialRevenueQuantity)===0,
    dpComplete:Number(result.missingFinancialDPQuantity)===0};
}

export async function getLegacyDPRevenue(aliases,start,end,read=getMany){
  validateBusinessDates(start,end);
  const params=[aliases?.map(v=>String(v).toLowerCase().trim()) || null,start || null,end || null];
  const [sales,refunds,rx]=await Promise.all([
    read(`SELECT s.*,a.dp,a.missing_dp FROM branch_walkin_sales s LEFT JOIN LATERAL (
      SELECT CASE WHEN COUNT(*) FILTER(WHERE snapshot->>'financial_dp_unit' IS NULL)=0
        THEN SUM(quantity*(snapshot->>'financial_dp_unit')::numeric) END AS dp,
        COUNT(*) FILTER(WHERE snapshot->>'financial_dp_unit' IS NULL) AS missing_dp
      FROM stock_sale_allocations WHERE sale_reference=s.id
    ) a ON TRUE WHERE status='completed' AND ($1::text[] IS NULL OR LOWER(TRIM(branch_id))=ANY($1))
      AND ($2::date IS NULL OR sale_date>=($2::date::timestamp AT TIME ZONE 'Africa/Windhoek'))
      AND ($3::date IS NULL OR sale_date<(($3::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek'))`,params),
    read(`SELECT r.quantity,r.refund_amount,rev.snapshot,s.customer_type,s.payment_method,s.data AS original_data,orig.movement_type AS original_type
      FROM branch_refund_requests r LEFT JOIN stock_linked_reversals rev ON rev.id=r.movement_id AND rev.kind='customer'
      LEFT JOIN branch_walkin_sales s ON s.id=r.sale_reference
      LEFT JOIN stock_movements orig ON orig.id=r.allocation_id
      WHERE r.status='approved' AND ($1::text[] IS NULL OR LOWER(TRIM(r.branch_id))=ANY($1))
      AND ($2::date IS NULL OR r.processed_at>=($2::date::timestamp AT TIME ZONE 'Africa/Windhoek'))
      AND ($3::date IS NULL OR r.processed_at<(($3::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek'))`,params),
    read(`SELECT product_total_dp FROM branch_activity_transactions
      WHERE activity_type='prescription_dispensing' AND workflow_source IS DISTINCT FROM 'dispense_draft'
      AND payment_status='paid' AND ($1::text[] IS NULL OR LOWER(TRIM(branch_id))=ANY($1))
      AND ($2::date IS NULL OR service_date>=$2::date) AND ($3::date IS NULL OR service_date<=$3::date)`,params),
  ]);
  const out={walkinSales:0,memberSales:0,nonMemberSales:0,onlineSales:0,prescriptionSales:0,
    cashTotal:0,swipeTotal:0,eftTotal:0,grossWalkinSalesDP:0,refundsDP:0,
    grossCustomerReceipts:0,customerRefunds:0,missingDPRecords:0,revenueBasis:'Distributor price (DP); frozen original evidence'};
  const category=ct=>String(ct || '').toLowerCase().includes('online')?'onlineSales':
    String(ct || '').toLowerCase().includes('member') && !String(ct).toLowerCase().includes('non')?'memberSales':'nonMemberSales';
  const discountFactor=data=>{
    try{if(typeof data==='string')data=JSON.parse(data);}catch{return NaN;}
    const percent=Number(data?.discount_pct || 0);
    return Number.isFinite(percent) && percent>=0 && percent<=100?1-percent/100:NaN;
  };
  for(const sale of sales){
    let dp=sale.dp==null?null:Number(sale.dp);
    if(['memberSales','onlineSales'].includes(category(sale.customer_type)))dp=Number(sale.total);
    else if(dp!=null)dp*=discountFactor(sale.data);
    if(dp==null && Number(sale.missing_dp || 0)===0){
      if(['memberSales','onlineSales'].includes(category(sale.customer_type)))dp=Number(sale.total);
      else{
        let items=sale.items;
        try{if(typeof items==='string')items=JSON.parse(items);}catch{items=null;}
        let data=sale.data;
        try{if(typeof data==='string')data=JSON.parse(data);}catch{data=null;}
        if(Array.isArray(items)&&items.length&&items.every(i=>(i.dpPrice ?? i.dp)!=null && (i.quantity ?? i.qty)!=null))
          dp=items.reduce((n,i)=>n+Number(i.dpPrice ?? i.dp)*Number(i.quantity ?? i.qty),0)*
            discountFactor(data);
      }
    }
    out.grossCustomerReceipts+=Number(sale.total || 0);
    if(dp==null || !Number.isFinite(dp)){out.missingDPRecords++;continue;}
    out.walkinSales+=dp;out[category(sale.customer_type)]+=dp;out.grossWalkinSalesDP+=dp;
    const key={cash:'cashTotal',card:'swipeTotal',swipe:'swipeTotal',eft:'eftTotal'}[sale.payment_method];
    if(key)out[key]+=dp;
  }
  for(const refund of refunds){
    out.customerRefunds+=Number(refund.refund_amount || 0);
    const unit=refund.snapshot?.financial_dp_unit;
    const dp=['memberSales','onlineSales'].includes(category(refund.customer_type))?Number(refund.refund_amount):
      unit!=null?Number(unit)*Number(refund.quantity)*discountFactor(refund.original_data):null;
    if(dp==null || !Number.isFinite(dp)){out.missingDPRecords++;continue;}
    out.refundsDP+=dp;
    if(refund.original_type==='prescription_dispense')out.prescriptionSales-=dp;
    else{out.walkinSales-=dp;out[category(refund.customer_type || refund.original_type)]-=dp;}
  }
  for(const row of rx){if(row.product_total_dp==null)out.missingDPRecords++;else out.prescriptionSales+=Number(row.product_total_dp);}
  return {...out,totalSales:out.walkinSales+out.prescriptionSales,
    netCustomerReceipts:out.grossCustomerReceipts-out.customerRefunds,
    dpComplete:out.missingDPRecords===0,paymentTotalsBasis:'Gross walk-in DP, before refunds'};
}
