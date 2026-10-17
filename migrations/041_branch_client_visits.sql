-- Exact public.branch_client_visits authority captured 2026-10-17T14:19:37Z.
-- Schema only; no production rows, invented foreign keys or history repair.
CREATE TABLE IF NOT EXISTS public.branch_client_visits (
  id character varying(100) NOT NULL,
  branch_id character varying(100) NOT NULL,
  client_name character varying(200),
  client_phone character varying(50),
  nb_number character varying(100),
  visit_type character varying(80) DEFAULT 'walk_in'::character varying,
  checkin_time timestamp with time zone DEFAULT now(),
  served_by character varying(100),
  status character varying(30) DEFAULT 'checked_in'::character varying,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT branch_client_visits_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_bcv_branch_date
  ON public.branch_client_visits USING btree (branch_id, checkin_time);
