import { applyAuthCors } from '../_lib/auth.js';
import {
  getDateRange,
  getAllBranchesSalesRevenue,
  getCompanyStockValueDP,
} from '../services/gmFinanceMisEngine.js';
import {getSalesReturnsSummary} from '../services/stockFinancialReports.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if(!req.user)return res.status(401).json({success:false,error:'Authentication required'});
  if(!['gm','general_manager','director','admin','superadmin','super_admin','finance','finance_manager','mis','stock'].includes(String(req.user.role).toLowerCase()))
    return res.status(403).json({success:false,error:'Company reporting access required'});

  try {
    const { start, end } = getDateRange(req.query);

    const [sales, stockValue,financial] = await Promise.all([
      getAllBranchesSalesRevenue(start, end),
      getCompanyStockValueDP(),
      getSalesReturnsSummary({from:start,to:end}),
    ]);

    res.json({
      success: true,
      period: { start, end },
      revenue: {
        ...sales,
        walkinSales: sales.walkinSales,
        memberSales: sales.memberSales,
        nonMemberSales: sales.nonMemberSales,
        onlineSales: sales.onlineSales,
        prescriptionSales: sales.prescriptionSales,
        totalSales: sales.totalSales,
      },
      stockValue: {
        ...stockValue,
        companyValueDP: stockValue.companyValueDP,
        warehouseValueDP: stockValue.warehouseValueDP,
        branchValueDP: stockValue.branchValueDP,
        writeOffValueDP: stockValue.writeOffValueDP,
      },financial,
    });
  } catch (err) {
    console.error('[finance/summary]', err);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
}
