// Four fixed worker read capabilities; no dynamic table or SQL-text admission.
export default {
  "worker/drift.mjs:branch-location": {
    "chunks": [
      "SELECT id,status FROM branches WHERE id=$1"
    ],
    "slots": [],
    "kind": "statement",
    "operation": "read",
    "group": "worker/drift.mjs",
    "contexts": [
      "worker"
    ]
  },
  "worker/drift.mjs:branch-variance": {
    "chunks": [
      "WITH physical AS (SELECT product_name, SUM(quantity)::numeric AS qty,COUNT(*)::int AS layers FROM branch_inventory_batches WHERE branch_id=$1 GROUP BY product_name), cached AS (SELECT product_name,closing_qty FROM inventory_balances WHERE location_id=$1 AND location_type=$2) SELECT COALESCE(p.product_name,c.product_name) AS product_name,c.closing_qty AS cached_quantity,p.qty AS known_physical_quantity,p.layers, CASE WHEN p.product_name IS NOT NULL AND c.product_name IS NOT NULL THEN c.closing_qty-p.qty ELSE NULL END AS difference FROM physical p FULL JOIN cached c ON p.product_name=c.product_name WHERE p.product_name IS NULL OR c.product_name IS NULL OR c.closing_qty<>p.qty"
    ],
    "slots": [],
    "kind": "statement",
    "operation": "read",
    "group": "worker/drift.mjs",
    "contexts": [
      "worker"
    ]
  },
  "worker/drift.mjs:warehouse-location": {
    "chunks": [
      "SELECT id,status FROM warehouse_locations WHERE id=$1"
    ],
    "slots": [],
    "kind": "statement",
    "operation": "read",
    "group": "worker/drift.mjs",
    "contexts": [
      "worker"
    ]
  },
  "worker/drift.mjs:warehouse-variance": {
    "chunks": [
      "WITH physical AS (SELECT description AS product_name,SUM(remaining_quantity)::numeric AS qty,COUNT(*)::int AS layers FROM stock_batches WHERE warehouse_id=$1 GROUP BY description), cached AS (SELECT product_name,closing_qty FROM inventory_balances WHERE location_id=$1 AND location_type=$2) SELECT COALESCE(p.product_name,c.product_name) AS product_name,c.closing_qty AS cached_quantity,p.qty AS known_physical_quantity,p.layers, CASE WHEN p.product_name IS NOT NULL AND c.product_name IS NOT NULL THEN c.closing_qty-p.qty ELSE NULL END AS difference FROM physical p FULL JOIN cached c ON p.product_name=c.product_name WHERE p.product_name IS NULL OR c.product_name IS NULL OR c.closing_qty<>p.qty"
    ],
    "slots": [],
    "kind": "statement",
    "operation": "read",
    "group": "worker/drift.mjs",
    "contexts": [
      "worker"
    ]
  }
};
