import { applyAuthCors } from '../_lib/auth.js';
import { query } from '../db.js';

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const branchParam = searchParams.get('branch');
    const startParam = searchParams.get('startDate');
    const endParam = searchParams.get('endDate');

    const params = [];
    const where = [
      `(s.customer_type = 'member' OR (s.referral_nb IS NOT NULL AND s.referral_nb != ''))`
    ];

    if (branchParam && branchParam !== 'all' && branchParam !== '') {
      params.push(branchParam);
      where.push(`s.branch_id = $${params.length}`);
    }

    const start = parseDate(startParam);
    const end = parseDate(endParam);

    if (start) {
      params.push(start.toISOString().slice(0, 10));
      where.push(`s.sale_date::date >= $${params.length}::date`);
    }

    if (end) {
      const endOfDay = new Date(end);
      endOfDay.setHours(23, 59, 59, 999);
      params.push(endOfDay.toISOString().slice(0, 10));
      where.push(`s.sale_date::date <= $${params.length}::date`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const sql = `
      SELECT
        s.branch_id                                                         AS branch_name,
        COALESCE(NULLIF(s.distributor_nb, ''), NULLIF(s.referral_nb, ''))  AS nb_number,
        s.customer_name                                                     AS name,
        s.sale_number                                                       AS receipt_number,
        s.sale_date::date                                                   AS date,
        COALESCE(
          NULLIF(TRIM(item->>'sku'),  ''),
          NULLIF(TRIM(item->>'code'), ''),
          ''
        )                                                                   AS product_code,
        COALESCE(
          NULLIF(TRIM(item->>'product_name'), ''),
          NULLIF(TRIM(item->>'name'),         ''),
          NULLIF(TRIM(item->>'description'),  ''),
          'Unknown'
        )                                                                   AS product_description,
        ROUND(COALESCE(
          (item->>'dp')::numeric,
          (item->>'dpPrice')::numeric,
          (item->>'unit_price')::numeric,
          0
        ), 2)                                                               AS dp,
        ROUND(COALESCE((item->>'bv')::numeric, 0), 2)                      AS bv,
        COALESCE(
          (item->>'quantity')::integer,
          (item->>'qty')::integer,
          1
        )                                                                   AS qty,
        ROUND(
          COALESCE((item->>'dp')::numeric, (item->>'dpPrice')::numeric, (item->>'unit_price')::numeric, 0)
          * COALESCE((item->>'quantity')::numeric, (item->>'qty')::numeric, 1),
        2)                                                                  AS total_dp,
        ROUND(
          COALESCE((item->>'bv')::numeric, 0)
          * COALESCE((item->>'quantity')::numeric, (item->>'qty')::numeric, 1),
        2)                                                                  AS total_bv
      FROM branch_walkin_sales s,
        jsonb_array_elements(
          CASE
            WHEN s.items IS NOT NULL AND jsonb_typeof(s.items) = 'array' THEN s.items
            ELSE '[]'::jsonb
          END
        ) AS item
      ${whereClause}
      ORDER BY s.sale_date DESC, s.id DESC
      LIMIT 5000
    `;

    const { rows } = await query(sql, params);

    return res.status(200).json({
      success: true,
      entries: rows,
      total: rows.length,
    });
  } catch (error) {
    console.error('MIS csi-entries API error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    });
  }
}
