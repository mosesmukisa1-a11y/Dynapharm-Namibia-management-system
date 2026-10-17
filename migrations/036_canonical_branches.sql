-- Offline-reviewed schema only: final managed snapshot, 17 October 2026.
-- No production execution authorized. Existing mismatched objects are NOT repaired.
CREATE TABLE IF NOT EXISTS public.branches (
  id character varying(60) NOT NULL,
  name character varying(255) NOT NULL,
  code character varying(60),
  region character varying(100),
  address text,
  phone character varying(50),
  email character varying(255),
  status character varying(30) DEFAULT 'active'::character varying,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT branches_pkey PRIMARY KEY (id),
  CONSTRAINT branches_code_key UNIQUE (code)
);
CREATE INDEX IF NOT EXISTS idx_branches_code ON public.branches USING btree (code);
CREATE INDEX IF NOT EXISTS idx_branches_status ON public.branches USING btree (status);
