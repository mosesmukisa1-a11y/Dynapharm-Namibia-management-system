-- Additive encounter evidence; existing clients/reports remain authoritative.
CREATE TABLE IF NOT EXISTS client_encounters (
 id TEXT PRIMARY KEY,
 client_id VARCHAR(255) NOT NULL REFERENCES clients(id),
 branch TEXT NOT NULL,
 service_at TIMESTAMPTZ NOT NULL,
 source TEXT NOT NULL CHECK(source IN ('in-system','outreach','paper','outage')),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','finalized')),
 responsible_consultant TEXT NOT NULL,
 captured_by TEXT NOT NULL,
 captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_by TEXT,
 reviewed_at TIMESTAMPTZ,
 report_id VARCHAR(255),
 version INTEGER NOT NULL DEFAULT 1,
 data JSONB NOT NULL DEFAULT '{}',
 CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS client_encounters_timeline ON client_encounters(client_id,service_at DESC);
CREATE TABLE IF NOT EXISTS client_history_events (
 id TEXT PRIMARY KEY,
 encounter_id TEXT NOT NULL REFERENCES client_encounters(id),
 actor TEXT NOT NULL,
 action TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 snapshot JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS client_history_operations (
 id TEXT PRIMARY KEY,
 actor TEXT NOT NULL,
 request JSONB NOT NULL,
 response JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS client_dispense_evidence (
 id TEXT PRIMARY KEY,
 encounter_id TEXT NOT NULL REFERENCES client_encounters(id),
 report_id VARCHAR(255) NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('historical','linked','live')),
 service_at TIMESTAMPTZ NOT NULL,
 captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 captured_by TEXT NOT NULL,
 source_reference TEXT,
 items JSONB NOT NULL,
 data JSONB NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS client_dispense_link_unique ON client_dispense_evidence(source_reference)
 WHERE mode='linked';

-- Private original-form metadata; no change or deletion of earlier evidence.
CREATE TABLE IF NOT EXISTS client_history_attachments (
 id TEXT PRIMARY KEY,
 client_id VARCHAR(255) NOT NULL REFERENCES clients(id),
 name TEXT NOT NULL,
 object_name TEXT NOT NULL UNIQUE,
 mime_type TEXT NOT NULL,
 size INTEGER NOT NULL,
 captured_by TEXT NOT NULL,
 captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
