-- Create towns table for delivery locations
CREATE TABLE IF NOT EXISTS towns (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    region VARCHAR(100),
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create delivery_distances table to store distances from branches to towns
CREATE TABLE IF NOT EXISTS delivery_distances (
    id VARCHAR(50) PRIMARY KEY,
    branch_id VARCHAR(50) NOT NULL,
    town_id VARCHAR(50) NOT NULL,
    distance_km NUMERIC(10, 2) NOT NULL,
    delivery_fee_percentage NUMERIC(5, 2) DEFAULT 15.00, -- 15% for <50km, 20% for >=50km
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    FOREIGN KEY (town_id) REFERENCES towns(id) ON DELETE CASCADE,
    UNIQUE(branch_id, town_id)
);

-- Create online_orders table with delivery information
CREATE TABLE IF NOT EXISTS online_orders (
    id VARCHAR(50) PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255),
    customer_phone VARCHAR(50),
    customer_type VARCHAR(20) DEFAULT 'customer', -- 'customer' or 'distributor'
    delivery_method VARCHAR(20) NOT NULL, -- 'pickup' or 'delivery'
    branch_id VARCHAR(50), -- Required for pickup, optional for delivery
    town_id VARCHAR(50), -- Required for delivery
    delivery_address TEXT, -- Full address for delivery
    subtotal NUMERIC(10, 2) NOT NULL,
    delivery_fee NUMERIC(10, 2) DEFAULT 0,
    delivery_fee_percentage NUMERIC(5, 2) DEFAULT 0,
    total_amount NUMERIC(10, 2) NOT NULL,
    distance_km NUMERIC(10, 2),
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'
    payment_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'paid', 'failed', 'refunded'
    payment_method VARCHAR(50),
    notes TEXT,
    items JSONB NOT NULL, -- Array of order items
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (town_id) REFERENCES towns(id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_delivery_distances_branch ON delivery_distances(branch_id);
CREATE INDEX IF NOT EXISTS idx_delivery_distances_town ON delivery_distances(town_id);
CREATE INDEX IF NOT EXISTS idx_online_orders_status ON online_orders(status);
CREATE INDEX IF NOT EXISTS idx_online_orders_customer ON online_orders(customer_email, customer_phone);
CREATE INDEX IF NOT EXISTS idx_online_orders_created ON online_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_towns_name ON towns(name);

-- Add trigger for updating updated_at
CREATE OR REPLACE FUNCTION update_delivery_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS towns_updated_at ON towns;
CREATE TRIGGER towns_updated_at
    BEFORE UPDATE ON towns
    FOR EACH ROW
    EXECUTE FUNCTION update_delivery_updated_at();

DROP TRIGGER IF EXISTS delivery_distances_updated_at ON delivery_distances;
CREATE TRIGGER delivery_distances_updated_at
    BEFORE UPDATE ON delivery_distances
    FOR EACH ROW
    EXECUTE FUNCTION update_delivery_updated_at();

DROP TRIGGER IF EXISTS online_orders_updated_at ON online_orders;
CREATE TRIGGER online_orders_updated_at
    BEFORE UPDATE ON online_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_delivery_updated_at();

-- Insert default towns (major towns in Namibia)
INSERT INTO towns (id, name, region) VALUES
    ('town_windhoek', 'Windhoek', 'Khomas'),
    ('town_oshakati', 'Oshakati', 'Omusati'),
    ('town_ondangwa', 'Ondangwa', 'Omusati'),
    ('town_rundu', 'Rundu', 'Kavango East'),
    ('town_walvis_bay', 'Walvis Bay', 'Erongo'),
    ('town_swakopmund', 'Swakopmund', 'Erongo'),
    ('town_katima_mulilo', 'Katima Mulilo', 'Zambezi'),
    ('town_gobabis', 'Gobabis', 'Omaheke'),
    ('town_otjiwarongo', 'Otjiwarongo', 'Otjozondjupa'),
    ('town_okahandja', 'Okahandja', 'Otjozondjupa'),
    ('town_keetmanshoop', 'Keetmanshoop', '//Karas'),
    ('town_luderitz', 'Luderitz', '//Karas'),
    ('town_tsumeb', 'Tsumeb', 'Oshikoto'),
    ('town_ongwediva', 'Ongwediva', 'Omusati'),
    ('town_outapi', 'Outapi', 'Omusati'),
    ('town_okongo', 'Okongo', 'Ohangwena'),
    ('town_okahao', 'Okahao', 'Omusati'),
    ('town_nkurenkuru', 'Nkurenkuru', 'Kavango West'),
    ('town_eenhana', 'Eenhana', 'Ohangwena'),
    ('town_hochland_park', 'Hochland Park', 'Khomas')
ON CONFLICT (id) DO NOTHING;

-- Insert delivery distances (example distances - these should be updated with actual distances)
-- For towns near branches, distance < 50km (15% fee)
-- For towns far from branches, distance >= 50km (20% fee)
-- This is a sample - actual distances should be calculated or entered manually

-- Windhoek branches to nearby towns (< 50km = 15%)
INSERT INTO delivery_distances (id, branch_id, town_id, distance_km, delivery_fee_percentage) VALUES
    ('dd_townshop_windhoek', 'townshop', 'town_windhoek', 5, 15.00),
    ('dd_townshop_hochland', 'townshop', 'town_hochland_park', 10, 15.00),
    ('dd_khomasdal_windhoek', 'khomasdal', 'town_windhoek', 8, 15.00),
    ('dd_hochland_windhoek', 'hochland-park', 'town_windhoek', 12, 15.00)
ON CONFLICT (branch_id, town_id) DO NOTHING;

-- Distances >= 50km (20% fee) - examples
INSERT INTO delivery_distances (id, branch_id, town_id, distance_km, delivery_fee_percentage) VALUES
    ('dd_townshop_oshakati', 'townshop', 'town_oshakati', 750, 20.00),
    ('dd_townshop_rundu', 'townshop', 'town_rundu', 850, 20.00),
    ('dd_townshop_walvis', 'townshop', 'town_walvis_bay', 380, 20.00),
    ('dd_townshop_swakop', 'townshop', 'town_swakopmund', 360, 20.00),
    ('dd_oshakati_windhoek', 'ondangwa', 'town_windhoek', 750, 20.00)
ON CONFLICT (branch_id, town_id) DO NOTHING;

-- Nearby distances for branch towns (< 50km = 15%)
INSERT INTO delivery_distances (id, branch_id, town_id, distance_km, delivery_fee_percentage) VALUES
    ('dd_ondangwa_ondangwa', 'ondangwa', 'town_ondangwa', 2, 15.00),
    ('dd_ondangwa_ongwediva', 'ondangwa', 'town_ongwediva', 15, 15.00),
    ('dd_oshakati_oshakati', 'outapi', 'town_oshakati', 45, 15.00),
    ('dd_walvis_walvis', 'walvisbay', 'town_walvis_bay', 3, 15.00),
    ('dd_swakop_swakop', 'swakopmund', 'town_swakopmund', 2, 15.00),
    ('dd_rundu_rundu', 'rundu', 'town_rundu', 5, 15.00),
    ('dd_katima_katima', 'katima', 'town_katima_mulilo', 2, 15.00),
    ('dd_gobabis_gobabis', 'gobabis', 'town_gobabis', 3, 15.00)
ON CONFLICT (branch_id, town_id) DO NOTHING;

