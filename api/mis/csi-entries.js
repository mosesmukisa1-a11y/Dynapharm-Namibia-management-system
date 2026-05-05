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
          CASE WHEN COALESCE((item->>'dp')::numeric,     0) > 0 THEN (item->>'dp')::numeric     END,
          CASE WHEN COALESCE((item->>'dpPrice')::numeric,0) > 0 THEN (item->>'dpPrice')::numeric END,
          CASE WHEN COALESCE((item->>'unit_price')::numeric, 0) > 0 AND s.customer_type = 'member'
               THEN (item->>'unit_price')::numeric END,
          pp.dp,
          0
        ), 2)                                                                    AS dp,
        ROUND(COALESCE(
          CASE WHEN COALESCE((item->>'bv')::numeric, 0) > 0 THEN (item->>'bv')::numeric END,
          pp.bv,
          0
        ), 2)                                                                    AS bv,
        COALESCE(
          (item->>'quantity')::integer,
          (item->>'qty')::integer,
          1
        )                                                                        AS qty,
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
        ROUND(
          COALESCE(
            CASE WHEN COALESCE((item->>'bv')::numeric, 0) > 0 THEN (item->>'bv')::numeric END,
            pp.bv,
            0
          )
          * COALESCE((item->>'quantity')::numeric, (item->>'qty')::numeric, 1),
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
      SELECT
        bat.branch_id                                                            AS branch_name,
        -- NB: prefer explicitly stored nb, fall back to prescription report data JSON
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
        bim.product_name                                                         AS product_description,
        ROUND(COALESCE(NULLIF(bim.unit_price, 0), pp.dp, 0), 2)                 AS dp,
        ROUND(COALESCE(pp.bv, 0), 2)                                            AS bv,
        bim.quantity                                                             AS qty,
        ROUND(COALESCE(NULLIF(bim.unit_price, 0), pp.dp, 0) * bim.quantity, 2) AS total_dp,
        ROUND(COALESCE(pp.bv, 0) * bim.quantity, 2)                            AS total_bv,
        false                                                                    AS is_free,
        'prescription'                                                            AS source
      FROM branch_activity_transactions bat
      JOIN branch_inventory_movements bim
        ON bim.reference = bat.form_reference_id
       AND bim.type = 'prescription_dispense'
       AND bim.branch_id = bat.branch_id
      LEFT JOIN reports r
        ON r.id = bat.form_reference_id
      LEFT JOIN product_prices pp
        ON LOWER(TRIM(pp.description)) = LOWER(TRIM(bim.product_name))
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
      -- Only fully paid + fully dispensed prescriptions (payment received / all dispensed confirmed)
      -- capture-rx.js sets workflow_source='dispense_draft' only when allDispensed AND allPaid.
      -- dispense.js sets workflow_source='branch_portal' for every dispense click (incl. partial).
      AND bat.workflow_source = 'dispense_draft'
      AND (
        -- Member prescription: must have NB number
        (
          (bat.client_type = 'member' OR COALESCE(r.data->>'membership_status','') = 'member')
          AND COALESCE(NULLIF(TRIM(bat.nb_number),''), NULLIF(TRIM(r.data->>'nb_number'),'')) IS NOT NULL
        )
        OR
        -- Non-member referral prescription: must have referral NB
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
