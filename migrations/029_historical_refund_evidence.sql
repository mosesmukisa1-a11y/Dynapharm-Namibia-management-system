ALTER TABLE branch_refund_requests ADD COLUMN IF NOT EXISTS historical_evidence_link_id TEXT;
CREATE TABLE IF NOT EXISTS stock_historical_refund_evidence (
 id TEXT PRIMARY KEY, refund_id TEXT NOT NULL, allocation_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','rejected')),
 proposed_by TEXT NOT NULL, proposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 evidence_reference TEXT NOT NULL, proposal_reason TEXT NOT NULL,
 request_snapshot JSONB NOT NULL, allocation_snapshot JSONB NOT NULL,
 request_hash TEXT NOT NULL, allocation_hash TEXT NOT NULL,
 reviewed_by TEXT, reviewed_at TIMESTAMPTZ, review_reason TEXT,
 CHECK(status='proposed' OR (reviewed_by IS NOT NULL AND review_reason IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS historical_refund_one_pending
 ON stock_historical_refund_evidence(refund_id) WHERE status='proposed';
CREATE INDEX IF NOT EXISTS historical_refund_evidence_refund
 ON stock_historical_refund_evidence(refund_id,proposed_at);
CREATE OR REPLACE FUNCTION protect_historical_refund_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Historical refund evidence is immutable'; END IF;
 IF OLD.status<>'proposed' OR
   (to_jsonb(NEW)-ARRAY['status','reviewed_by','reviewed_at','review_reason'])
     IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','reviewed_by','reviewed_at','review_reason'])
 THEN RAISE EXCEPTION 'Historical refund evidence is immutable'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS historical_refund_evidence_immutable ON stock_historical_refund_evidence;
CREATE TRIGGER historical_refund_evidence_immutable BEFORE UPDATE OR DELETE
 ON stock_historical_refund_evidence FOR EACH ROW EXECUTE FUNCTION protect_historical_refund_evidence();
