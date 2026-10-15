// No repair, movement, request, price or accounting writes are available here.
// A variance is a review candidate on known exact-ID source layers, never proof
// of missing goods or permission to overwrite a cached/physical balance.
export async function detectDrift(ctx){
  for(const scope of ctx.scope){
    const table=scope.type==='branch'?'branches':'warehouse_locations';
    const location=await ctx.read(`SELECT id,status FROM ${table} WHERE id=$1`,[scope.id]);
    if(!location.rows.length||location.rows[0].status!=='active')throw Object.assign(Error('Invalid worker location'),{code:'INVALID_SCOPE'});
    const physical=scope.type==='branch'?
      `SELECT product_name, SUM(quantity)::numeric AS qty,COUNT(*)::int AS layers
       FROM branch_inventory_batches WHERE branch_id=$1 GROUP BY product_name`:
      `SELECT description AS product_name,SUM(remaining_quantity)::numeric AS qty,COUNT(*)::int AS layers
       FROM stock_batches WHERE warehouse_id=$1 GROUP BY description`;
    const {rows}=await ctx.read(`WITH physical AS (${physical}),
      cached AS (SELECT product_name,closing_qty FROM inventory_balances
        WHERE location_id=$1 AND location_type=$2)
      SELECT COALESCE(p.product_name,c.product_name) AS product_name,
       c.closing_qty AS cached_quantity,p.qty AS known_physical_quantity,p.layers,
       CASE WHEN p.product_name IS NOT NULL AND c.product_name IS NOT NULL THEN c.closing_qty-p.qty ELSE NULL END AS difference
      FROM physical p FULL JOIN cached c ON p.product_name=c.product_name
      WHERE p.product_name IS NULL OR c.product_name IS NULL OR c.closing_qty<>p.qty`,
    [scope.id,scope.type]);
    for(const row of rows){
      if(!row.product_name)throw Object.assign(Error('Missing product identity'),{code:'MISSING_PRODUCT_IDENTITY'});
      await ctx.finding({...scope,...row,
      finding_type:row.known_physical_quantity===null?'missing_source':
        row.cached_quantity===null?'missing_cache':'review_variance'});
    }
  }
}
