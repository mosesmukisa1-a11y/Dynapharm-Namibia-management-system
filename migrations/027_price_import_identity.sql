CREATE TABLE IF NOT EXISTS product_prices (
  id SERIAL PRIMARY KEY,description VARCHAR(255) NOT NULL UNIQUE,
  dp NUMERIC(10,2) DEFAULT 0,cp NUMERIC(10,2) DEFAULT 0,cif NUMERIC(10,2) DEFAULT 0,
  bv NUMERIC(10,2) DEFAULT 0,is_package BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_by VARCHAR(255)
);
CREATE TABLE IF NOT EXISTS product_price_history (
  id SERIAL PRIMARY KEY,product_id INTEGER REFERENCES product_prices(id),
  description VARCHAR(255),old_dp NUMERIC(10,2),old_cp NUMERIC(10,2),
  old_cif NUMERIC(10,2),old_bv NUMERIC(10,2),new_dp NUMERIC(10,2),
  new_cp NUMERIC(10,2),new_cif NUMERIC(10,2),new_bv NUMERIC(10,2),
  changed_by VARCHAR(255),changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS product_code VARCHAR(30);
ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS original_cif NUMERIC(10,2);
ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS vat_pct NUMERIC(5,2) DEFAULT 15;
ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS import_duty_pct NUMERIC(5,2) DEFAULT 0;
ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS clearing_fee NUMERIC(10,2) DEFAULT 1;
ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS merged_into_id INTEGER REFERENCES product_prices(id);
ALTER TABLE product_price_history ADD COLUMN IF NOT EXISTS effective_from DATE DEFAULT CURRENT_DATE;
ALTER TABLE product_price_history ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'applied';
ALTER TABLE product_price_history ADD COLUMN IF NOT EXISTS original_product_id INTEGER;
CREATE TABLE IF NOT EXISTS price_import_additions (
 id SERIAL PRIMARY KEY, description TEXT NOT NULL, product_code TEXT, dp NUMERIC(10,2) NOT NULL,
 cp NUMERIC(10,2) NOT NULL, cif NUMERIC(10,2) NOT NULL DEFAULT 0, bv NUMERIC(10,2) NOT NULL DEFAULT 0,
 effective_from DATE NOT NULL, changed_by TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), product_id INTEGER REFERENCES product_prices(id)
);
CREATE TABLE IF NOT EXISTS price_reconciliation_backups (
 id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_by TEXT NOT NULL,
 canonical_id INTEGER NOT NULL, snapshot JSONB NOT NULL
);
ALTER TABLE price_import_additions ADD COLUMN IF NOT EXISTS activation_error TEXT;
-- Name lookups retain archived descriptions but always return current canonical
-- prices and IDs. Catalogue lists select catalogue_entry so aliases never become
-- duplicate products. Equivalent case/spacing aliases appear once per identity.
CREATE OR REPLACE VIEW live_product_prices AS
SELECT DISTINCT ON (LOWER(REGEXP_REPLACE(TRIM(names.description), '\s+', ' ', 'g')), canonical.id)
  (jsonb_populate_record(NULL::product_prices,
    to_jsonb(canonical) || jsonb_build_object('description',names.description))).*,
  ARRAY(SELECT old.description FROM product_prices old
    WHERE old.merged_into_id=canonical.id ORDER BY old.id) AS aliases,
  names.catalogue_entry
FROM product_prices alias
JOIN product_prices canonical ON canonical.id=COALESCE(alias.merged_into_id,alias.id)
CROSS JOIN LATERAL (
  SELECT alias.description,alias.id=canonical.id AS catalogue_entry
  UNION ALL
  SELECT REGEXP_REPLACE(canonical.description,'^[A-Za-z]{1,3}[0-9]{4,6}[A-Za-z]?\s+',''),FALSE
  WHERE alias.id=canonical.id
    AND canonical.description ~ '^[A-Za-z]{1,3}[0-9]{4,6}[A-Za-z]?\s+'
    AND UPPER(SPLIT_PART(canonical.description,' ',1))=UPPER(canonical.product_code)
) names
WHERE canonical.merged_into_id IS NULL
ORDER BY LOWER(REGEXP_REPLACE(TRIM(names.description), '\s+', ' ', 'g')),
  canonical.id,names.catalogue_entry DESC,alias.id;
