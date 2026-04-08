-- Migration 025: Ensure nb_number is nullable on distributor_agreements
-- Agreements start without an NB number; it is only assigned after payment is collected.
-- This prevents deployment failures caused by NULL values conflicting with NOT NULL constraint.
ALTER TABLE distributor_agreements ALTER COLUMN nb_number DROP NOT NULL;
