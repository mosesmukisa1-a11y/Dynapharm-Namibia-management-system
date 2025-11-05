-- Create distributors table
CREATE TABLE IF NOT EXISTS distributors (
    id VARCHAR(50) PRIMARY KEY,
    distributor_code VARCHAR(50) UNIQUE NOT NULL,
    distributor_name VARCHAR(255) NOT NULL,
    mobile_no VARCHAR(50),
    email VARCHAR(255),
    commission_rate NUMERIC(5,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    branch VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    FOREIGN KEY (branch) REFERENCES branches(id)
);

-- Add images column to products table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'images'
    ) THEN
        ALTER TABLE products ADD COLUMN images JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- Create product_images table for storing image data
CREATE TABLE IF NOT EXISTS product_images (
    id VARCHAR(50) PRIMARY KEY,
    product_id VARCHAR(50) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    image_data TEXT NOT NULL, -- Base64 encoded image
    image_url TEXT, -- URL if stored externally
    image_type VARCHAR(10) DEFAULT 'jpg', -- jpg, png, webp
    width INTEGER,
    height INTEGER,
    file_size INTEGER, -- in bytes
    is_primary BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product_name ON product_images(product_name);
CREATE INDEX IF NOT EXISTS idx_distributors_code ON distributors(distributor_code);
CREATE INDEX IF NOT EXISTS idx_distributors_name ON distributors(distributor_name);

-- Add trigger for distributors to update updated_at
CREATE OR REPLACE FUNCTION update_distributors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    IF NEW.version IS NOT NULL THEN
        NEW.version = OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS distributors_updated_at ON distributors;
CREATE TRIGGER distributors_updated_at
    BEFORE UPDATE ON distributors
    FOR EACH ROW
    EXECUTE FUNCTION update_distributors_updated_at();

-- Add trigger for product_images to update updated_at
CREATE OR REPLACE FUNCTION update_product_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_images_updated_at ON product_images;
CREATE TRIGGER product_images_updated_at
    BEFORE UPDATE ON product_images
    FOR EACH ROW
    EXECUTE FUNCTION update_product_images_updated_at();

-- Add NOTIFY trigger for distributors
DROP TRIGGER IF EXISTS distributors_notify ON distributors;
CREATE TRIGGER distributors_notify
    AFTER INSERT OR UPDATE OR DELETE ON distributors
    FOR EACH ROW
    EXECUTE FUNCTION notify_change();

-- Add NOTIFY trigger for product_images
DROP TRIGGER IF EXISTS product_images_notify ON product_images;
CREATE TRIGGER product_images_notify
    AFTER INSERT OR UPDATE OR DELETE ON product_images
    FOR EACH ROW
    EXECUTE FUNCTION notify_change();

