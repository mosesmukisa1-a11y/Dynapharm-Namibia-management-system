import { applyAuthCors } from '../_lib/auth.js';
import {
  getDateRange,
  getCompanyStockSummary,
  getAllBranchesSalesRevenue,
} from '../services/gmFinanceMisEngine.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { start, end } = getDateRange(req.query);

    const [companyStock, sales] = await Promise.all([
      getCompanyStockSummary(),
      getAllBranchesSalesRevenue(start, end),
    ]);

    res.json({
      success: true,
      period: { start, end },
      companyStock: {
        totalQty: companyStock.totalQty,
        totalValueDP: companyStock.totalValueDP,
        warehouseQty: companyStock.warehouseQty,
        branchQty: companyStock.branchQty,
        inTransitQty: companyStock.inTransitQty,
        lowStockCount: companyStock.lowStockCount,
        expiringCount: companyStock.expiringCount,
      },
      sales: {
        consultationFees: sales.consultationFees,
        walkinSales: sales.walkinSales,
        memberSales: sales.memberSales,
        nonMemberSales: sales.nonMemberSales,
        onlineSales: sales.onlineSales,
        prescriptionSales: sales.prescriptionSales,
        totalSales: sales.totalSales,
      },
    });
  } catch (err) {
    console.error('[gm/summary]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
