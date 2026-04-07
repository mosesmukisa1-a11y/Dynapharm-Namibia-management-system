-- Migration 022: Campaign workflow fields for GM approval workflow
-- Adds columns to support campaign submission, GM review, and rejection tracking.
-- Note: campaigns.status is varchar (not an enum), so 'pending_approval' and
-- 'rejected' values are valid without schema changes. This migration adds the
-- supplementary tracking columns and indexes for the approval workflow.

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS submitted_by TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS rejection_note TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

-- Indexes for efficiently querying campaigns by status and submitter
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);
CREATE INDEX IF NOT EXISTS idx_campaigns_submitted_by ON campaigns (submitted_by);
