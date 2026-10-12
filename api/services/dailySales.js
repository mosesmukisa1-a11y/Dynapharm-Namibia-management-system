import {getMany} from '../db.js';
import {getLegacyDPRevenue,getSalesReturnsSummary} from './stockFinancialReports.js';
import {validateBusinessDates} from './businessDates.js';

export const COMPANY_REPORT_ROLES=new Set(['gm','general_manager','director','admin','superadmin','super_admin','finance','finance_manager','mis','stock']);
export function businessToday(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Windhoek',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
// Exact persisted branch IDs, not display-name merges. Alias reconciliation is
// a separate evidence exercise, not a reason to count one sale under two IDs.
export async function getDailySales(date=businessToday()){
  validateBusinessDates(date,date);
  const ids=await getMany(`SELECT LOWER(TRIM(branch_id)) AS branch_id,SUM(transactions)::int AS transactions FROM (
    SELECT branch_id,COUNT(*) AS transactions FROM branch_walkin_sales
    WHERE status='completed'
      AND sale_date>=($1::date::timestamp AT TIME ZONE 'Africa/Windhoek')
      AND sale_date<(($1::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek') GROUP BY branch_id
    UNION ALL SELECT branch_id,0 FROM branch_refund_requests WHERE status='approved'
      AND processed_at>=($1::date::timestamp AT TIME ZONE 'Africa/Windhoek')
      AND processed_at<(($1::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek') GROUP BY branch_id
    UNION ALL SELECT branch_id,0 FROM branch_activity_transactions
      WHERE service_date=$1::date AND activity_type='prescription_dispensing'
        AND payment_status='paid' AND workflow_source IS DISTINCT FROM 'dispense_draft' GROUP BY branch_id
  ) events WHERE branch_id IS NOT NULL GROUP BY LOWER(TRIM(branch_id))`,[date]);
  const branches=await Promise.all(ids.map(async row=>{
    const sales=await getLegacyDPRevenue([row.branch_id],date,date);
    return {branchId:row.branch_id,transactions:Number(row.transactions),revenue:sales.totalSales,
      memberRevenue:sales.memberSales,nonMemberRevenue:sales.nonMemberSales,
      onlineRevenue:sales.onlineSales,rxRevenue:sales.prescriptionSales,
      cashRevenue:sales.cashTotal,cardEftRevenue:sales.swipeTotal+sales.eftTotal,
      walkinCustomerReceipts:sales.netCustomerReceipts,dpComplete:sales.dpComplete,
      missingDPRecords:sales.missingDPRecords};
  }));
  branches.sort((a,b)=>b.revenue-a.revenue);
  const sum=key=>branches.reduce((total,b)=>total+Number(b[key] || 0),0);
  const financial=await getSalesReturnsSummary({from:date,to:date});
  return {success:true,date,scope:'company',timezone:'Africa/Windhoek',
    summary:{totalRevenue:sum('revenue'),totalTransactions:sum('transactions'),activeBranchCount:branches.length,
      memberRevenue:sum('memberRevenue'),nonMemberRevenue:sum('nonMemberRevenue'),onlineRevenue:sum('onlineRevenue'),
      rxRevenue:sum('rxRevenue'),walkinCustomerReceipts:sum('walkinCustomerReceipts'),
      matchedOriginalChargedRevenue:financial.netSalesRevenue,dpComplete:branches.every(b=>b.dpComplete),
      missingDPRecords:sum('missingDPRecords'),revenueBasis:'Net DP from saved sale evidence; approved returns at original DP',
      receiptsBasis:'Net walk-in customer receipts; not DP or all prescription receipts',
      transactionBasis:'Completed walk-in receipts',paymentBasis:'Gross walk-in DP before refunds'},financial,branches};
}
