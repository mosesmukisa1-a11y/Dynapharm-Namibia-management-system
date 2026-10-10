-- Replace only the read-performance index, never physical rows or costs.
-- Long index expressions are truncated by the publishing schema introspector.
-- Two short keys support both explicit location and legacy warehouse fallback.
DROP INDEX IF EXISTS cost_stock_location_product;
CREATE INDEX cost_stock_location_product ON stock_batches
  (LOWER(TRIM(location)),LOWER(TRIM(description)))
  WHERE remaining_quantity>0;
CREATE INDEX IF NOT EXISTS cost_stock_warehouse_product ON stock_batches
  (LOWER(TRIM(warehouse_id)),LOWER(TRIM(description)))
  WHERE remaining_quantity>0 AND (location IS NULL OR location='');
