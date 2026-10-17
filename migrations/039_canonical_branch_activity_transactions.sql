-- Authoritative catalog metadata plus narrowly authorized exact defaults.
-- No rows copied. Existing conflicting objects are never rewritten.
CREATE TABLE IF NOT EXISTS public.branch_activity_transactions (
  id character varying(100) NOT NULL,
  branch_id character varying(100) NOT NULL,
  branch_name character varying(200),
  client_id character varying(100),
  client_name character varying(200),
  client_phone character varying(50),
  client_type character varying(50) DEFAULT 'walk_in'::character varying,
  nb_number character varying(100),
  referral_nb character varying(100),
  service_date date NOT NULL,
  service_time time without time zone,
  activity_type character varying(80) NOT NULL,
  workflow_source character varying(80),
  form_reference_id character varying(150),
  consultation_fee numeric(12,2) DEFAULT '0'::numeric,
  product_total_dp numeric(12,2) DEFAULT '0'::numeric,
  product_total_cp numeric(12,2) DEFAULT '0'::numeric,
  total_qty numeric DEFAULT 0,
  grand_total numeric(12,2) DEFAULT '0'::numeric,
  payment_status character varying(30) DEFAULT 'paid'::character varying,
  payment_method character varying(30) DEFAULT 'cash'::character varying,
  stock_impact boolean DEFAULT false,
  stock_status character varying(30) DEFAULT 'not_required'::character varying,
  prescription_status character varying(30) DEFAULT 'none'::character varying,
  consultation_status character varying(30) DEFAULT 'none'::character varying,
  reporting_status character varying(30) DEFAULT 'posted'::character varying,
  captured_by character varying(100),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  total_bv numeric DEFAULT '0'::numeric NOT NULL,
  CONSTRAINT branch_activity_transactions_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_bat_activity_type ON public.branch_activity_transactions USING btree (activity_type);
CREATE INDEX IF NOT EXISTS idx_bat_branch_date ON public.branch_activity_transactions USING btree (branch_id, service_date);
CREATE INDEX IF NOT EXISTS idx_bat_reporting_status ON public.branch_activity_transactions USING btree (reporting_status);
