-- Migration: Create file_uploads table for storing uploaded files
-- This table stores file metadata and base64-encoded file data

CREATE TABLE IF NOT EXISTS file_uploads (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'FILE-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 9),
    upload_type VARCHAR(50) NOT NULL, -- 'product', 'distributor', 'user', 'document', etc.
    entity_id VARCHAR(255), -- ID of the related entity (product_id, distributor_code, etc.)
    entity_name VARCHAR(255), -- Name of the related entity (for lookup)
    filename VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL, -- Base64 data URL or external URL
    file_size BIGINT, -- File size in bytes
    mime_type VARCHAR(100), -- MIME type (image/jpeg, image/png, etc.)
    uploaded_by VARCHAR(255), -- User who uploaded
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB -- Additional metadata
);

CREATE INDEX IF NOT EXISTS idx_file_uploads_type ON file_uploads(upload_type);
CREATE INDEX IF NOT EXISTS idx_file_uploads_entity ON file_uploads(entity_id);
CREATE INDEX IF NOT EXISTS idx_file_uploads_uploaded_at ON file_uploads(uploaded_at);

-- Add photo columns to distributors table if they don't exist
ALTER TABLE distributors 
ADD COLUMN IF NOT EXISTS photo_url TEXT,
ADD COLUMN IF NOT EXISTS photo_filename VARCHAR(255),
ADD COLUMN IF NOT EXISTS photo_updated_at TIMESTAMP;

-- Add photo columns to product_images table if they don't exist
ALTER TABLE product_images 
ADD COLUMN IF NOT EXISTS filename VARCHAR(255),
ADD COLUMN IF NOT EXISTS file_size BIGINT,
ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP;

COMMENT ON TABLE file_uploads IS 'Stores metadata for uploaded files (images, documents, etc.)';
COMMENT ON COLUMN file_uploads.file_url IS 'Base64 data URL or external URL to the file';

