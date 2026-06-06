import { applyAuthCors } from '../_lib/auth.js';
import {
  getDateRange,
  getAllBranchesSalesRevenue,
  getCompanyStockValueDP,
} from '../services/gmFinanceMisEngine.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { start, end } = getDateRange(req.query);

    const [sales, stockValue] = await Promise.all([
      getAllBranchesSalesRevenue(start, end),
      getCompanyStockValueDP(),
    ]);

    res.json({
      success: true,
      period: { start, end },
      revenue: {
        walkinSales: sales.walkinSales,
        memberSales: sales.memberSales,
        nonMemberSales: sales.nonMemberSales,
        onlineSales: sales.onlineSales,
        prescriptionSales: sales.prescriptionSales,
        totalSales: sales.totalSales,
      },
      stockValue: {
        companyValueDP: stockValue.companyValueDP,
        warehouseValueDP: stockValue.warehouseValueDP,
        branchValueDP: stockValue.branchValueDP,
        writeOffValueDP: stockValue.writeOffValueDP,
      },
    });
  } catch (err) {
    console.error('[finance/summary]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
