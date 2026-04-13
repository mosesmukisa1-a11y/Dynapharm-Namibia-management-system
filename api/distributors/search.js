/**
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
    return rows.map(r => ({
      distributorId: r.distributor_id,
      fullName:      r.full_name,
      nbNumber:      r.nb_number,
      branchId:      r.branch_id,
      status:        r.status,
      phone:         r.mobile_no,
      email:         r.email,
    }));
  }

  try {
    if (!q || q.trim().length < 1) {
      // No search term — return active distributors (first 200, sorted by name)
      const [dbRows, userRows] = await Promise.all([
        getMany(
          `SELECT d.id AS distributor_id, d.distributor_name AS full_name,
                  d.distributor_code AS nb_number, d.branch AS branch_id,
                  COALESCE(d.status, 'active') AS status, d.mobile_no, d.email
           FROM distributors d
           WHERE (d.status = 'active' OR d.status IS NULL)
             AND d.entity_type != 'branch'
           ORDER BY d.distributor_name
           LIMIT 200`,
          []
        ),
        getMany(
          `SELECT id AS distributor_id, COALESCE(full_name, username) AS full_name,
                  username AS nb_number, branch AS branch_id,
                  'active' AS status, phone AS mobile_no, email
           FROM users
           WHERE role = 'distributor' AND is_active = true
           ORDER BY full_name
           LIMIT 200`,
          []
        ),
      ]);

      const existingCodes = new Set(dbRows.map(r => (r.nb_number || '').toUpperCase()));
      userRows.forEach(u => {
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

    const [dbRows, userRows] = await Promise.all([
      getMany(
        `SELECT d.id AS distributor_id, d.distributor_name AS full_name,
                d.distributor_code AS nb_number, d.branch AS branch_id,
                COALESCE(d.status, 'active') AS status, d.mobile_no, d.email
         FROM distributors d
         WHERE (
           d.distributor_name ILIKE $1
           OR d.distributor_code ILIKE $1
           OR d.mobile_no ILIKE $1
         )
         ${statusFilter}
         AND d.entity_type != 'branch'
         ORDER BY
           CASE
             WHEN d.distributor_code ILIKE $2 THEN 0
             WHEN d.distributor_name ILIKE $2 THEN 1
             ELSE 2
           END,
           d.distributor_name
         LIMIT 100`,
        [term, startsWith]
      ),
      getMany(
        `SELECT id AS distributor_id, COALESCE(full_name, username) AS full_name,
                username AS nb_number, branch AS branch_id,
                'active' AS status, phone AS mobile_no, email
         FROM users
         WHERE role = 'distributor' AND is_active = true
           AND (full_name ILIKE $1 OR username ILIKE $1 OR phone ILIKE $1)
         ORDER BY
           CASE WHEN username ILIKE $2 THEN 0 WHEN full_name ILIKE $2 THEN 1 ELSE 2 END,
           full_name
         LIMIT 50`,
        [term, startsWith]
      ),
    ]);

    const existingCodes = new Set(dbRows.map(r => (r.nb_number || '').toUpperCase()));
    userRows.forEach(u => {
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
