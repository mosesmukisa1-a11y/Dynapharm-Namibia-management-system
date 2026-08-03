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
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const branchParam = searchParams.get('branch');
    const startParam = searchParams.get('startDate');
    const endParam = searchParams.get('endDate');

    const params = [];

    // ── Walk-in tab condition ─────────────────────────────────────────────────
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

    const walkinWhereClause = `WHERE ${where.join(' AND ')}`;

    // ── Prescription tab date/branch params (same values, new param indices) ──
    // We re-use the same $1..$N values from the walkin query by appending more.
    const rxWhere = [];

    if (branchParam && branchParam !== 'all' && branchParam !== '') {
      // Re-use param already added (it's the first one if set)
      const branchIdx = where.findIndex(w => w.includes('branch_id'));
      if (branchIdx >= 0) {
        // Find its param index by counting previous params
        // Easiest: just push a new param for the prescription subquery
        params.push(branchParam);
        rxWhere.push(`bat.branch_id = $${params.length}`);
      }
    }

    if (start) {
      params.push(start.toISOString().slice(0, 10));
      rxWhere.push(`bat.service_date::date >= $${params.length}::date`);
    }

    if (end) {
      params.push(end.toISOString().slice(0, 10));
      rxWhere.push(`bat.service_date::date <= $${params.length}::date`);
    }

    const rxWhereClause = rxWhere.length > 0 ? `AND ${rxWhere.join(' AND ')}` : '';

    // ── Combined query: walk-in items UNION prescription items ───────────────
    const sql = `
      -- ── Part 1: Walk-in tab sales (branch_walkin_sales) ──────────────────
      SELECT
        s.branch_id                                                              AS branch_name,
        CASE
          WHEN s.customer_type = 'member' THEN TRIM(s.distributor_nb)
          ELSE TRIM(s.referral_nb)
        END                                                                      AS nb_number,
        CASE
          WHEN s.customer_type = 'member' THEN s.customer_name
          ELSE COALESCE(d.distributor_name, TRIM(s.referral_nb))
        END                                                                      AS name,
        s.sale_number                                                            AS receipt_number,
        s.sale_date::date                                                        AS date,
        COALESCE(
          NULLIF(TRIM(item->>'sku'),  ''),
          NULLIF(TRIM(item->>'code'), ''),
          ''
        )                                                                        AS product_code,
        COALESCE(
          NULLIF(TRIM(item->>'product_name'), ''),
          NULLIF(TRIM(item->>'name'),         ''),
          NULLIF(TRIM(item->>'description'),  ''),
          pp.description,
          'Unknown'
        )                                                                        AS product_description,
        ROUND(COALESCE(
          NULLIF(pp.dp, 0),
          CASE WHEN COALESCE((item->>'dp')::numeric,     0) > 0 THEN (item->>'dp')::numeric     END,
          CASE WHEN COALESCE((item->>'dpPrice')::numeric,0) > 0 THEN (item->>'dpPrice')::numeric END,
          CASE WHEN COALESCE((item->>'unit_price')::numeric, 0) > 0 AND s.customer_type = 'member'
               THEN (item->>'unit_price')::numeric END,
          0
        ), 2)                                                                    AS dp,
        ROUND(
          CASE
            WHEN COALESCE(pp.bv, 0) > 0
              THEN pp.bv
            WHEN COALESCE((item->>'bv')::numeric, 0) > 0
              THEN (item->>'bv')::numeric
                   / GREATEST(COALESCE((item->>'quantity')::numeric, (item->>'qty')::numeric, 1), 1)
            ELSE 0
          END,
        2)                                                                       AS bv,
        COALESCE(
          (item->>'quantity')::integer,
          (item->>'qty')::integer,
          1
        )                                                                        AS qty,
        ROUND(
          COALESCE(
            NULLIF(pp.dp, 0),
            CASE WHEN COALESCE((item->>'dp')::numeric, 0) > 0 THEN (item->>'dp')::numeric END,
            CASE WHEN COALESCE((item->>'dpPrice')::numeric, 0) > 0 THEN (item->>'dpPrice')::numeric END,
            CASE WHEN COALESCE((item->>'unit_price')::numeric, 0) > 0 AND s.customer_type = 'member'
                 THEN (item->>'unit_price')::numeric END,
            0
          )
          * COALESCE((item->>'quantity')::numeric, (item->>'qty')::numeric, 1),
        2)                                                                       AS total_dp,
        ROUND(
          CASE
            WHEN COALESCE(pp.bv, 0) > 0
              THEN pp.bv * COALESCE((item->>'quantity')::numeric, (item->>'qty')::numeric, 1)
            WHEN COALESCE((item->>'bv')::numeric, 0) > 0
              THEN (item->>'bv')::numeric
            ELSE 0
          END,
        2)                                                                       AS total_bv,
        COALESCE((item->>'is_free')::boolean, false)                             AS is_free,
        'walkin'                                                                  AS source
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
      LEFT JOIN distributors d
        ON s.customer_type IS DISTINCT FROM 'member'
       AND TRIM(UPPER(d.distributor_code)) = TRIM(UPPER(s.referral_nb))
      WHERE NOT EXISTS (
        SELECT 1 FROM branch_refund_requests rr
        WHERE rr.status = 'approved'
          AND rr.sale_reference = s.sale_number
          AND LOWER(TRIM(rr.product_name)) = LOWER(TRIM(
            COALESCE(
              NULLIF(TRIM(item->>'product_name'), ''),
              NULLIF(TRIM(item->>'name'),         ''),
              NULLIF(TRIM(item->>'description'),  '')
            )
          ))
      )
      AND (${where.join(' AND ')})

      UNION ALL

      -- ── Part 2: Prescription tab dispenses (branch_activity_transactions + branch_inventory_movements) ──
      -- BIM rows are pre-aggregated by (reference, branch_id, product_name) so that a single
      -- product dispensed from multiple batches produces exactly ONE CSI row, not N rows.
      SELECT
        bat.branch_id                                                            AS branch_name,
        CASE
          WHEN bat.client_type = 'member'
            OR COALESCE(r.data->>'membership_status', '') = 'member'
          THEN COALESCE(
            NULLIF(TRIM(bat.nb_number), ''),
            NULLIF(TRIM(r.data->>'nb_number'), '')
          )
          ELSE COALESCE(
            NULLIF(TRIM(bat.referral_nb), ''),
            NULLIF(TRIM(r.data->>'referral_nb'), '')
          )
        END                                                                      AS nb_number,
        CASE
          WHEN bat.client_type = 'member'
            OR COALESCE(r.data->>'membership_status', '') = 'member'
          THEN bat.client_name
          ELSE COALESCE(
            d.distributor_name,
            NULLIF(TRIM(bat.referral_nb), ''),
            NULLIF(TRIM(r.data->>'referral_nb'), ''),
            bat.client_name
          )
        END                                                                      AS name,
        'RX-' || bat.form_reference_id                                          AS receipt_number,
        bat.service_date::date                                                   AS date,
        ''                                                                       AS product_code,
        bim_agg.product_name                                                     AS product_description,
        ROUND(COALESCE(NULLIF(pp.dp, 0), NULLIF(bim_agg.avg_unit_price, 0), 0), 2) AS dp,
        ROUND(COALESCE(pp.bv, 0), 2)                                            AS bv,
        bim_agg.total_qty                                                        AS qty,
        ROUND(COALESCE(NULLIF(pp.dp, 0), NULLIF(bim_agg.avg_unit_price, 0), 0) * bim_agg.total_qty, 2) AS total_dp,
        ROUND(COALESCE(pp.bv, 0) * bim_agg.total_qty, 2)                       AS total_bv,
        false                                                                    AS is_free,
        'prescription'                                                            AS source
      FROM branch_activity_transactions bat
      -- Aggregate multi-batch BIM rows into one row per (reference, branch, product)
      JOIN (
        SELECT
          reference,
          branch_id,
          MIN(TRIM(product_name))            AS product_name,
          LOWER(TRIM(MIN(product_name)))     AS product_key,
          SUM(ABS(quantity))                 AS total_qty,
          AVG(COALESCE(unit_price, 0))       AS avg_unit_price
        FROM branch_inventory_movements
        WHERE type = 'prescription_dispense'
        GROUP BY reference, branch_id, LOWER(TRIM(product_name))
      ) bim_agg
        ON bim_agg.reference = bat.form_reference_id
       AND bim_agg.branch_id = bat.branch_id
      LEFT JOIN reports r
        ON r.id = bat.form_reference_id
      LEFT JOIN product_prices pp
        ON LOWER(TRIM(pp.description)) = bim_agg.product_key
      LEFT JOIN distributors d
        ON bat.client_type IS DISTINCT FROM 'member'
       AND COALESCE(r.data->>'membership_status', '') IS DISTINCT FROM 'member'
       AND TRIM(UPPER(d.distributor_code)) = TRIM(UPPER(
             COALESCE(
               NULLIF(TRIM(bat.referral_nb), ''),
               NULLIF(TRIM(r.data->>'referral_nb'), '')
             )
           ))
      WHERE bat.activity_type = 'prescription_dispensing'
      AND bat.workflow_source = 'branch_portal'
      AND (
        (
          (bat.client_type = 'member' OR COALESCE(r.data->>'membership_status','') = 'member')
          AND COALESCE(NULLIF(TRIM(bat.nb_number),''), NULLIF(TRIM(r.data->>'nb_number'),'')) IS NOT NULL
        )
        OR
        (
          bat.client_type IS DISTINCT FROM 'member'
          AND COALESCE(r.data->>'membership_status','') IS DISTINCT FROM 'member'
          AND COALESCE(NULLIF(TRIM(bat.referral_nb),''), NULLIF(TRIM(r.data->>'referral_nb'),'')) IS NOT NULL
        )
      )
      ${rxWhereClause}

      ORDER BY date DESC, receipt_number DESC
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
