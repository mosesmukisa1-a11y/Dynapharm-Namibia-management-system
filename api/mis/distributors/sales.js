import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';
import { getDateRange, normalizeBranchName } from '../../services/gmFinanceMisEngine.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { start, end } = getDateRange(req.query);

    // MIS sales lines with distributor info (from encoded/MIS drafts)
    const misRows = await getMany(
      `SELECT l.distributor_code, l.distributor_name, d.branch_id,
              SUM(l.quantity) as sales_qty,
              SUM(l.quantity * l.unit_price) as encoded_value
       FROM mis_sales_lines l
       JOIN mis_sales_drafts d ON d.id = l.draft_id
       WHERE l.distributor_code IS NOT NULL
         AND l.sale_timestamp >= $1::date
         AND l.sale_timestamp <= ($2 || 'T23:59:59')::timestamp
       GROUP BY l.distributor_code, l.distributor_name, d.branch_id
       ORDER BY l.distributor_code, d.branch_id`,
      [start, end]
    );

    // Live distributor-linked sales from branch_walkin_sales
    // customer_type = 'member' indicates member/distributor sales
    const liveRows = await getMany(
      `SELECT
         COALESCE(metadata->>'distributor_code', data->>'distributorCode') as distributor_nb,
         COALESCE(customer_name, metadata->>'distributorName') as distributor_name,
         branch_id,
         SUM(total) as live_value,
         COUNT(*) as sale_count
       FROM branch_walkin_sales
       WHERE status = 'completed'
         AND customer_type ILIKE '%member%'
         AND NOT customer_type ILIKE '%non%'
         AND sale_date >= $1::date
         AND sale_date <= ($2 || 'T23:59:59')::timestamp
       GROUP BY distributor_nb, distributor_name, branch_id`,
      [start, end]
    );

    // Build encoded map keyed by distributor_code + branch_id
    const encodedMap = new Map();
    for (const r of misRows) {
      const key = `${r.distributor_code || ''}|${r.branch_id}`;
      encodedMap.set(key, {
        distributorNb: r.distributor_code,
        distributorName: r.distributor_name || r.distributor_code,
        branchId: r.branch_id,
        branchName: normalizeBranchName(r.branch_id),
        salesQty: Number(r.sales_qty || 0),
        encodedValue: Number(r.encoded_value || 0),
      });
    }

    // Build live map
    const liveMap = new Map();
    for (const r of liveRows) {
      const nb = r.distributor_nb || '';
      const key = `${nb}|${r.branch_id}`;
      liveMap.set(key, { salesValue: Number(r.live_value || 0), distributorName: r.distributor_name });
    }

    const allKeys = new Set([...encodedMap.keys(), ...liveMap.keys()]);
    const results = [];

    for (const key of allKeys) {
      const encoded = encodedMap.get(key) || {};
      const live = liveMap.get(key) || {};
      const [nb, branchId] = key.split('|');
      results.push({
        distributorNb: encoded.distributorNb || nb,
        distributorName: encoded.distributorName || live.distributorName || nb,
        branchName: encoded.branchName || normalizeBranchName(branchId),
        salesQty: encoded.salesQty || 0,
        salesValue: live.salesValue || 0,
        encodedValue: encoded.encodedValue || 0,
        difference: (live.salesValue || 0) - (encoded.encodedValue || 0),
      });
    }

    results.sort((a, b) => (a.distributorNb || '').localeCompare(b.distributorNb || ''));
    res.json({ success: true, period: { start, end }, distributorSales: results });
  } catch (err) {
    console.error('[mis/distributors/sales]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
