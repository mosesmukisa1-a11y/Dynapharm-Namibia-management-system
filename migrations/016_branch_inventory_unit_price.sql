-- Migration 016: Add unit_price to branch_inventory_movements
-- Allows capturing the DP price at the time of dispense/sale for accurate reporting.

ALTER TABLE branch_inventory_movements
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,4);

-- Migration tracking is handled by the migration runner (run-migrations.js)
