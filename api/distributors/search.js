import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js"; /**
 * GET /api/distributors/search?q=moses&activeOnly=true
 * Dedicated distributor search endpoint used by all portals for distributor lookup.
 * Searches name, NB/DZ code, and mobile number.
 * Results ordered by relevance: exact code match → starts-with name → contains.
 * Merges results from distributors table AND users table (role=distributor).
 */
import { getMany } from '../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { q = '', activeOnly } = req.query;
  const onlyActive = activeOnly === 'true' || activeOnly === '1';
  const statusFilter = onlyActive ? `AND (d.status = 'active' OR d.status IS NULL)` : '';

  function formatRows(rows) {
    return rows.map((r) => ({
      distributorId: r.distributor_id,
      fullName: r.full_name,
      nbNumber: r.nb_number,
      branchId: r.branch_id,
      status: r.status,
      phone: r.mobile_no,
      email: r.email
    }));
  }

  try {
    if (!q || q.trim().length < 1) {
      // No search term — return active distributors (first 200, sorted by name)
      const [dbRows, userRows] = await Promise.all([__qd_executePlan(
        getMany, __qd_registeredPlan("api/distributors/search.js:34:0"),








        []), __qd_executePlan(

        getMany, __qd_registeredPlan("api/distributors/search.js:45:1"),







        [])]

      );

      const existingCodes = new Set(dbRows.map((r) => (r.nb_number || '').toUpperCase()));
      userRows.forEach((u) => {
        if (!existingCodes.has((u.nb_number || '').toUpperCase())) {
          dbRows.push(u);
        }
      });

      return res.json({ success: true, distributors: formatRows(dbRows), total: dbRows.length });
    }

    // Search term provided — search name, code, and mobile number
    const raw = q.trim();
    const term = `%${raw}%`;
    const startsWith = `${raw}%`;

    const [dbRows, userRows] = await Promise.all([__qd_executePlan(
      getMany, __qd_registeredPlan("api/distributors/search.js:73:2", [









      statusFilter]),









      [term, startsWith]), __qd_executePlan(

      getMany, __qd_registeredPlan("api/distributors/search.js:95:3"),










      [term, startsWith])]

    );

    const existingCodes = new Set(dbRows.map((r) => (r.nb_number || '').toUpperCase()));
    userRows.forEach((u) => {
      if (!existingCodes.has((u.nb_number || '').toUpperCase())) {
        dbRows.push(u);
      }
    });

    return res.json({ success: true, distributors: formatRows(dbRows), total: dbRows.length });
  } catch (err) {
    console.error('[distributors/search]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
