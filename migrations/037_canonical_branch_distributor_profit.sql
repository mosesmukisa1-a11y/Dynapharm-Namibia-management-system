-- Exact captured schema; no business/history records or financial repairs.
CREATE TABLE IF NOT EXISTS public.branch_distributor_profit (
  id character varying(60) NOT NULL,
  branch_id character varying(60) NOT NULL,
  distributor_nb character varying(50) NOT NULL,
  distributor_name character varying(255),
  sale_id character varying(60),
  sale_receipt character varying(60),
  sale_date timestamp with time zone DEFAULT now(),
  profit_amount numeric(12,2) DEFAULT '0'::numeric NOT NULL,
  status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
  paid_at timestamp with time zone,
  paid_by character varying(100),
  payment_method character varying(50),
  payment_note text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  original_profit_id text,
  reversal_reference text,
  CONSTRAINT branch_distributor_profit_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_bdp_branch ON public.branch_distributor_profit USING btree (branch_id);
CREATE INDEX IF NOT EXISTS idx_bdp_distributor ON public.branch_distributor_profit USING btree (distributor_nb);
CREATE INDEX IF NOT EXISTS idx_bdp_sale ON public.branch_distributor_profit USING btree (sale_id);
CREATE INDEX IF NOT EXISTS idx_bdp_status ON public.branch_distributor_profit USING btree (status);
