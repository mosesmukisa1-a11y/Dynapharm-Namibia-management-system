/**
 * GET /api/director/registrations/summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Countrywide and per-branch registrations (clients + distributors).
 */
import { getDateRange, normalizeBranchName } from '../../services/gmFinanceMisEngine.js';
import { getMany, getOne } from '../../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);

  const [clientRows, distRows, branchRows] = await Promise.all([
    getMany(
      `SELECT COALESCE(branch,'unassigned') as branch_id, COUNT(*) as cnt
       FROM clients
       WHERE created_at >= $1::date AND created_at <= ($2 || 'T23:59:59')::timestamp
       GROUP BY branch`,
      [start, end]
    ),
    getMany(
      `SELECT COALESCE(branch,'unassigned') as branch_id, COUNT(*) as cnt
       FROM distributors
       WHERE created_at >= $1::date AND created_at <= ($2 || 'T23:59:59')::timestamp
       GROUP BY branch`,
      [start, end]
    ),
    getMany(`SELECT id, name FROM branches WHERE status = 'active'`),
  ]);

  const branchMap = new Map(branchRows.map(b => [b.id, b.name]));

  const combined = new Map();
  for (const r of clientRows) {
    const id = r.branch_id;
    combined.set(id, (combined.get(id) || 0) + Number(r.cnt));
  }
  for (const r of distRows) {
    const id = r.branch_id;
    combined.set(id, (combined.get(id) || 0) + Number(r.cnt));
  }

  let countrywideRegistrations = 0;
  const branches = [];
  for (const [branchId, count] of combined.entries()) {
    countrywideRegistrations += count;
    branches.push({
      branchId,
      branchName: branchMap.get(branchId) || normalizeBranchName(branchId),
      registrationsCount: count,
    });
  }
  branches.sort((a, b) => b.registrationsCount - a.registrationsCount);

  return res.json({
    success: true,
    period: { start, end },
    countrywideRegistrations,
    branches,
  });
}
