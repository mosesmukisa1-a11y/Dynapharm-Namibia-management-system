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

    // CSI tracks member/distributor activity:
    //   1. Member's own purchase: customer_type='member', distributor_nb = their own NB
    //   2. Non-member referral sale: referral_nb = the referring member's NB
    //      → attributed to the referring member (show their NB + their name from distributors table)
    const baseCondition = `(
      (s.customer_type = 'member' AND s.distributor_nb IS NOT NULL AND TRIM(s.distributor_nb) != '')
      OR (
        (s.referral_nb IS NOT NULL AND TRIM(s.referral_nb) != '')
        AND (s.customer_type IS DISTINCT FROM 'member')
      )
    )`;

    const where = [baseCondition];

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

    const whereClause = `WHERE ${where.join(' AND ')}`;

    const sql = `
      SELECT
        s.branch_id                                                              AS branch_name,
        -- NB: for member's own purchase use their distributor_nb;
        --     for referral sale use referral_nb (the referring member's NB)
        CASE
          WHEN s.customer_type = 'member' THEN TRIM(s.distributor_nb)
          ELSE TRIM(s.referral_nb)
        END                                                                      AS nb_number,
        -- Name: for member purchases the customer IS the member;
        --       for referral sales look up the referring member's name from distributors
        CASE
          WHEN s.customer_type = 'member' THEN s.customer_name
          ELSE COALESCE(d.distributor_name, TRIM(s.referral_nb))
        END                                                                      AS name,
        s.sale_number                                                            AS receipt_number,
        s.sale_date::date                                                        AS date,
        -- Product code: from JSONB first, fall back to product_prices
        COALESCE(
          NULLIF(TRIM(item->>'sku'),  ''),
          NULLIF(TRIM(item->>'code'), ''),
          ''
        )                                                                        AS product_code,
        -- Product description: prefer JSONB, fall back to product_prices description
        COALESCE(
          NULLIF(TRIM(item->>'product_name'), ''),
          NULLIF(TRIM(item->>'name'),         ''),
          NULLIF(TRIM(item->>'description'),  ''),
          pp.description,
          'Unknown'
        )                                                                        AS product_description,
        -- DP: use item dp if non-zero, otherwise look up from product_prices
        ROUND(COALESCE(
          CASE WHEN COALESCE((item->>'dp')::numeric,     0) > 0 THEN (item->>'dp')::numeric     END,
          CASE WHEN COALESCE((item->>'dpPrice')::numeric,0) > 0 THEN (item->>'dpPrice')::numeric END,
          CASE WHEN COALESCE((item->>'unit_price')::numeric, 0) > 0 AND s.customer_type = 'member'
               THEN (item->>'unit_price')::numeric END,
          pp.dp,
          0
        ), 2)                                                                    AS dp,
        -- BV
        ROUND(COALESCE(
          CASE WHEN COALESCE((item->>'bv')::numeric, 0) > 0 THEN (item->>'bv')::numeric END,
          pp.bv,
          0
        ), 2)                                                                    AS bv,
        -- QTY
        COALESCE(
          (item->>'quantity')::integer,
          (item->>'qty')::integer,
          1
        )                                                                        AS qty,
        -- Total DP
        ROUND(
          COALESCE(
            CASE WHEN COALESCE((item->>'dp')::numeric, 0) > 0 THEN (item->>'dp')::numeric END,
            CASE WHEN COALESCE((item->>'dpPrice')::numeric, 0) > 0 THEN (item->>'dpPrice')::numeric END,
            CASE WHEN COALESCE((item->>'unit_price')::numeric, 0) > 0 AND s.customer_type = 'member'
                 THEN (item->>'unit_price')::numeric END,
            pp.dp,
            0
          )
          * COALESCE((item->>'quantity')::numeric, (item->>'qty')::numeric, 1),
        2)                                                                       AS total_dp,
        -- Total BV
        ROUND(
          COALESCE(
            CASE WHEN COALESCE((item->>'bv')::numeric, 0) > 0 THEN (item->>'bv')::numeric END,
            pp.bv,
            0
          )
          * COALESCE((item->>'quantity')::numeric, (item->>'qty')::numeric, 1),
        2)                                                                       AS total_bv
      FROM branch_walkin_sales s
      CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN s.items IS NOT NULL AND jsonb_typeof(s.items) = 'array' THEN s.items
            ELSE '[]'::jsonb
          END
        ) AS item
      LEFT JOIN product_prices pp
        ON LOWER(TRIM(pp.description)) = LOWER(TRIM(
          COALESCE(
            NULLIF(TRIM(item->>'product_name'), ''),
            NULLIF(TRIM(item->>'name'),         ''),
            NULLIF(TRIM(item->>'description'),  '')
          )
        ))
      -- For referral sales, look up the referring member's name by their NB number
      LEFT JOIN distributors d
        ON s.customer_type IS DISTINCT FROM 'member'
       AND TRIM(UPPER(d.distributor_code)) = TRIM(UPPER(s.referral_nb))
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
