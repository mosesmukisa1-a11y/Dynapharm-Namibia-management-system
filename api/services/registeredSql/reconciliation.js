// Two reviewed fixed reconciliation compositions; no runtime SQL text registration.
export default {
  "api/services/stockReadOnlyReconciliation.js:base": {
    "chunks": [
      "SELECT (SELECT to_jsonb(p) FROM (",
      ") p) AS projection,\n    COALESCE((SELECT jsonb_agg(b) FROM (SELECT location_id,location_type,product_name,batch_no,\n      expiry_date,closing_qty,projection_version FROM inventory_balances LIMIT 20001) b),'[]'::jsonb) AS balances,\n    COALESCE((SELECT jsonb_agg(m) FROM (SELECT product_name,batch_no,expiry_date,SUM(quantity) AS quantity,movement_type,\n      source_location,destination_location,source_location_type,destination_location_type,\n      COUNT(*) FILTER(WHERE reference_id IS NULL OR reference_id='') AS missing_reference_count,\n      COUNT(*) AS movement_count FROM stock_movements WHERE status IN ('posted','approved')\n      GROUP BY product_name,batch_no,expiry_date,movement_type,source_location,destination_location,\n        source_location_type,destination_location_type\n      LIMIT 50001) m),'[]'::jsonb) AS movements"
    ],
    "slots": [
      {
        "kind": "part"
      }
    ],
    "kind": "statement",
    "operation": "read",
    "group": "api/services/stockReadOnlyReconciliation.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ]
  },
  "api/services/stockReadOnlyReconciliation.js:compact": {
    "chunks": [
      "SELECT projection,\n    COALESCE((SELECT jsonb_agg(jsonb_build_array(b->'location_id',b->'product_name',b->'batch_no',\n      b->'expiry_date',b->'closing_qty',b->'projection_version'))\n      FROM jsonb_array_elements(balances) b),'[]'::jsonb) AS \"balanceTuples\",\n    COALESCE((SELECT jsonb_agg(jsonb_build_array(m->'product_name',m->'batch_no',m->'expiry_date',\n      m->'quantity',m->'movement_type',m->'source_location',m->'destination_location',\n      m->'source_location_type',m->'destination_location_type',m->'movement_count',m->'missing_reference_count'))\n      FROM jsonb_array_elements(movements) m),'[]'::jsonb) AS \"movementTuples\"\n    FROM (",
      ") snapshot"
    ],
    "slots": [
      {
        "kind": "part"
      }
    ],
    "kind": "statement",
    "operation": "read",
    "group": "api/services/stockReadOnlyReconciliation.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ]
  }
};
