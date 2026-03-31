-- Migration 020: Add unit_cif column to stock_movements for CIF cost tracking
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_cif NUMERIC(14,4);
