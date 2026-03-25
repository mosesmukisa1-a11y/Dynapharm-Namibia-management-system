/**
 * GET /api/distributors/search?q=moses&activeOnly=true
 * Dedicated distributor search endpoint for referral lookup in consultations.
 */
import { getMany } from '../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { q = '', activeOnly } = req.query;
  if (!q || q.trim().length < 1) return res.json({ success: true, distributors: [] });

  const term = `%${q.trim()}%`;
  const params = [term, term];
  let statusFilter = '';
  if (activeOnly === 'true' || activeOnly === '1') {
    statusFilter = `AND (d.status = 'active' OR d.status IS NULL)`;
  }

  const rows = await getMany(
    `SELECT d.id as distributor_id, d.distributor_name as full_name,
            d.distributor_code as nb_number, d.branch as branch_id,
            COALESCE(d.status, 'active') as status, d.mobile_no, d.email
     FROM distributors d
     WHERE (d.distributor_name ILIKE $1 OR d.distributor_code ILIKE $2)
       ${statusFilter}
       AND d.entity_type != 'branch'
     ORDER BY d.distributor_name
     LIMIT 30`,
    params
  );

  const distributors = rows.map(r => ({
    distributorId: r.distributor_id,
    fullName: r.full_name,
    nbNumber: r.nb_number,
    branchId: r.branch_id,
    status: r.status,
    phone: r.mobile_no,
    email: r.email,
  }));

  return res.json({ success: true, distributors, total: distributors.length });
}
