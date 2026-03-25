/**
 * GET /api/director/branches/expenses?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Rent, overheads, and bonus per branch.
 */
import { getDateRange, getAllBranchLocations, normalizeBranchName } from '../../services/gmFinanceMisEngine.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);

  const [branchLocations, expRows] = await Promise.all([
    getAllBranchLocations(),
    getMany(
      `SELECT branch_id,
         COALESCE(SUM(CASE WHEN LOWER(category) LIKE '%rent%' THEN amount ELSE 0 END), 0) as rent,
         COALESCE(SUM(CASE WHEN LOWER(category) NOT LIKE '%rent%' AND LOWER(category) NOT LIKE '%bonus%' THEN amount ELSE 0 END), 0) as overheads,
         COALESCE(SUM(CASE WHEN LOWER(category) LIKE '%bonus%' THEN amount ELSE 0 END), 0) as bonus
       FROM branch_expenses
       WHERE date >= $1::date AND date <= $2::date
       GROUP BY branch_id`,
      [start, end]
    ),
  ]);

  const expMap = new Map(expRows.map(r => [r.branch_id, {
    rent: Number(r.rent), overheads: Number(r.overheads), bonus: Number(r.bonus),
  }]));

  const branchNameMap = new Map(branchLocations.map(l => [l.locationId, l.locationName]));

  const allBranchIds = new Set([
    ...branchLocations.map(l => l.locationId),
    ...expRows.map(r => r.branch_id),
  ]);

  const result = [...allBranchIds].map(branchId => {
    const exp = expMap.get(branchId) || { rent: 0, overheads: 0, bonus: 0 };
    return {
      branchId,
      branchName: branchNameMap.get(branchId) || normalizeBranchName(branchId),
      rentExpense: exp.rent,
      monthlyOverheads: exp.overheads,
      bonusPayout: exp.bonus,
    };
  });

  result.sort((a, b) => a.branchName.localeCompare(b.branchName));

  return res.json({ success: true, period: { start, end }, branches: result });
}
