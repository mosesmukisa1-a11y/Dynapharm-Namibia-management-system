import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js"; /**
 * GET /api/reports/sales/company?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Company-wide sales report from all completed live sales.
 */
import { getAllBranchesSalesRevenue, getDateRange } from '../../services/gmFinanceMisEngine.js';
import { getOne } from '../../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });

  const { start, end } = getDateRange(req.query);

  const [revenue, unitsRow] = await Promise.all([
  getAllBranchesSalesRevenue(start, end), __qd_executePlan(
    getOne, __qd_registeredPlan("api/reports/sales/company.js:17:0"),







    [start, end])]

  );

  return res.json({
    success: true,
    period: { start, end },
    consultationFees: revenue.consultationFees,
    walkinSales: revenue.walkinSales,
    memberSales: revenue.memberSales,
    nonMemberSales: revenue.nonMemberSales,
    onlineSales: revenue.onlineSales,
    prescriptionSales: revenue.prescriptionSales,
    totalSales: revenue.totalSales,
    totalUnits: Number(unitsRow?.total_units || 0)
  });
}
