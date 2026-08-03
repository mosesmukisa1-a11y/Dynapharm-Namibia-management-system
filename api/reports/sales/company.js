/**
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
    getAllBranchesSalesRevenue(start, end),
    getOne(
      `SELECT COALESCE(SUM(quantity), 0) as total_units
       FROM stock_movements
       WHERE status = 'posted'
         AND movement_type IN ('walkin_sale','walkin_member_sale','walkin_non_member_sale',
           'walk_in_member_sale','walk_in_non_member_sale','sale','prescription_dispense')
         AND created_at >= $1::date
         AND created_at <= ($2 || 'T23:59:59')::timestamp`,
      [start, end]
    ),
  ]);

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
    totalUnits: Number(unitsRow?.total_units || 0),
  });
}
