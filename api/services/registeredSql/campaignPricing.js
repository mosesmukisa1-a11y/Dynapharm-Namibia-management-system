// Fixed queries: modern sales use captured per-item commercial DP, never current cost.
const projection = `SELECT bim.reference,bim.branch_id,MIN(TRIM(bim.product_name)) AS product_name,
  bim.batch_no,bim.type,SUM(ABS(bim.quantity)) AS total_qty,
  SUM(ABS(bim.quantity) * CASE WHEN bim.type='campaign_free_item' THEN 0 ELSE
    COALESCE((bim.metadata->'sale_evidence'->>'dp_unit_price')::numeric,
      saved.effective_dp,
      CASE WHEN bim.type='campaign_sale' THEN bim.unit_price ELSE
        ROUND(pp.dp*(1-COALESCE((bws.data->>'discount_pct')::numeric,0)/100),2) END,0) END) AS total_dp,
  MIN(CASE WHEN bim.type='campaign_free_item' THEN 0 ELSE
    COALESCE((bim.metadata->'sale_evidence'->>'charged_unit_price')::numeric,
      saved.charged_unit,bim.unit_price) END) AS sold_unit_price,
  MAX(COALESCE(saved.original_dp,pp.dp)) AS list_dp,
  BOOL_OR((bim.metadata->'sale_evidence'->>'dp_unit_price') IS NOT NULL OR saved.effective_dp IS NOT NULL) AS captured_pricing
  FROM branch_inventory_movements bim
  LEFT JOIN live_product_prices pp ON LOWER(TRIM(pp.description))=LOWER(TRIM(bim.product_name))
  LEFT JOIN branch_walkin_sales bws ON bws.id=bim.reference
  LEFT JOIN LATERAL (
    SELECT SUM((i->>'effective_dp')::numeric*(i->>'quantity')::numeric)/NULLIF(SUM((i->>'quantity')::numeric),0) AS effective_dp,
      SUM((i->>'original_dp')::numeric*(i->>'quantity')::numeric)/NULLIF(SUM((i->>'quantity')::numeric),0) AS original_dp,
      SUM((i->>'unit_price')::numeric*(i->>'quantity')::numeric)/NULLIF(SUM((i->>'quantity')::numeric),0) AS charged_unit
    FROM jsonb_array_elements(COALESCE(bws.items,'[]'::jsonb)) i
    WHERE LOWER(TRIM(COALESCE(i->>'product_name',i->>'name',i->>'description')))=LOWER(TRIM(bim.product_name))
      AND i ? 'effective_dp'
  ) saved ON true
  WHERE `;
const campaignFilter = ` AND (bim.type IN ('campaign_sale','campaign_free_item') OR
  (bim.type IN ('walk_in_member_sale','walk_in_non_member_sale','sale') AND bws.data->>'sale_type'='campaign_sale'))
  GROUP BY bim.reference,bim.branch_id,LOWER(TRIM(bim.product_name)),bim.batch_no,bim.type`;
const definition = sql => ({ chunks: [sql], slots: [], operation: 'read',
  contexts: ['service', 'request', 'transaction'], group: 'campaign-pricing-report', kind: 'statement' });
export default {
  'campaign-pricing-report:daily': definition(projection + `
    bim.created_at>=($1::date::timestamp AT TIME ZONE 'Africa/Windhoek')
    AND bim.created_at<(($1::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek')
    AND ($2::text IS NULL OR LOWER(REPLACE(bim.branch_id,' ','_'))=$2)` + campaignFilter),
  'campaign-pricing-report:monthly': definition(projection + `
    bim.created_at>=($1::date::timestamp AT TIME ZONE 'Africa/Windhoek')
    AND bim.created_at<($2::date::timestamp AT TIME ZONE 'Africa/Windhoek')
    AND ($3::text IS NULL OR LOWER(REPLACE(bim.branch_id,' ','_'))=$3)` + campaignFilter),
};
