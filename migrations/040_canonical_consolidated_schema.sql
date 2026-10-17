-- Authority: consolidated-seven-object-authority-v1, 2026-10-17T13:43:28.307608Z.
-- Seven owner-authorized catalog objects, no business rows. Offline rollout only.
-- Apply this foundation before older CREATE IF NOT EXISTS variants on EMPTY
-- disposable schemas. Existing incompatible objects are detected by contracts,
-- not silently rewritten. Never reset sequence values or change historical IDs.
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
  END;
  $function$;

CREATE TABLE IF NOT EXISTS public.products (
 id character varying(50) NOT NULL,
 sku character varying(100),
 name character varying(255) NOT NULL,
 description text,
 category character varying(100),
 unit character varying(50),
 dp numeric(12,2),
 cp numeric(12,2),
 bv numeric(12,2),
 tax_rate numeric(5,2) DEFAULT 0,
 is_active boolean DEFAULT true,
 branch character varying(50),
 images jsonb DEFAULT '[]'::jsonb,
 created_by character varying(50),
 created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
 updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT products_pkey PRIMARY KEY(id)
);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products USING btree(category);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products USING btree(is_active);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products USING btree(name);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products USING btree(sku);

CREATE TABLE IF NOT EXISTS public.product_images (
 id character varying(50) NOT NULL,
 product_id character varying(50) NOT NULL,
 product_name character varying(255),
 image_data text,
 image_url text,
 image_type character varying(10) DEFAULT 'jpg'::character varying,
 width integer,
 height integer,
 file_size integer,
 is_primary boolean DEFAULT false,
 display_order integer DEFAULT 0,
 variant_data jsonb,
 thumbnail_url text,
 created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
 updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
 filename character varying(255),
 mime_type character varying(100),
 uploaded_at timestamp without time zone,
 CONSTRAINT product_images_pkey PRIMARY KEY(id),
 CONSTRAINT product_images_product_id_fkey FOREIGN KEY(product_id) REFERENCES public.products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images USING btree(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product_name ON public.product_images USING btree(product_name);

CREATE TABLE IF NOT EXISTS public.file_uploads (
 id character varying(255) NOT NULL DEFAULT ((('FILE-'::text || (EXTRACT(epoch FROM now()))::bigint) || '-'::text) || SUBSTRING(md5((random())::text) FROM 1 FOR 9)),
 upload_type character varying(50) NOT NULL,
 entity_id character varying(255),
 entity_name character varying(255),
 filename character varying(255) NOT NULL,
 file_url text NOT NULL,
 file_size bigint,
 mime_type character varying(100),
 uploaded_by character varying(255),
 uploaded_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
 metadata jsonb,
 description text,
 category character varying(100),
 media_type character varying(50),
 CONSTRAINT file_uploads_pkey PRIMARY KEY(id)
);
CREATE INDEX IF NOT EXISTS idx_file_uploads_entity ON public.file_uploads USING btree(entity_id);
CREATE INDEX IF NOT EXISTS idx_file_uploads_type ON public.file_uploads USING btree(upload_type);
CREATE INDEX IF NOT EXISTS idx_file_uploads_uploaded_at ON public.file_uploads USING btree(uploaded_at);

CREATE TABLE IF NOT EXISTS public.field_program_requests (
 id character varying(100) NOT NULL,
 activity_type character varying(50),
 location text,
 date date,
 time character varying(20),
 coordinator text,
 target_audience text,
 notes text,
 status character varying(30) DEFAULT 'scheduled'::character varying,
 branch character varying(100),
 products jsonb,
 returned_items jsonb,
 requires_approval boolean DEFAULT false,
 approved_by character varying(100),
 approved_at timestamp with time zone,
 created_by character varying(100),
 created_at timestamp with time zone DEFAULT now(),
 updated_at timestamp with time zone DEFAULT now(),
 distributor_id text,
 distributor_name text,
 distributor_code text,
 signature text,
 distributors jsonb DEFAULT '[]'::jsonb,
 reconciled_at timestamp with time zone,
 reconciled_by text,
 CONSTRAINT field_program_requests_pkey PRIMARY KEY(id)
);

CREATE SEQUENCE IF NOT EXISTS public.hr_staff_change_requests_id_seq AS integer
 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE TABLE IF NOT EXISTS public.hr_staff_change_requests (
 id integer NOT NULL DEFAULT nextval('hr_staff_change_requests_id_seq'::regclass),
 request_type character varying(20) NOT NULL,
 employee_id character varying(100),
 full_name character varying(200) NOT NULL,
 position character varying(200),
 department character varying(100),
 branch character varying(100),
 hire_date date,
 phone character varying(50),
 email character varying(200),
 reason text,
 status character varying(20) NOT NULL DEFAULT 'pending'::character varying,
 requested_by character varying(200) NOT NULL,
 requested_at timestamp with time zone NOT NULL DEFAULT now(),
 reviewed_by character varying(200),
 reviewed_at timestamp with time zone,
 gm_note text,
 employee_row_id character varying(100),
 profile_changes jsonb,
 user_id text,
 CONSTRAINT hr_staff_change_requests_pkey PRIMARY KEY(id),
 CONSTRAINT hr_staff_change_requests_request_type_check CHECK(request_type::text = ANY (ARRAY['add'::character varying::text,'remove'::character varying::text])),
 CONSTRAINT hr_staff_change_requests_status_check CHECK(status::text = ANY (ARRAY['pending'::character varying::text,'approved'::character varying::text,'rejected'::character varying::text]))
);
ALTER SEQUENCE public.hr_staff_change_requests_id_seq OWNED BY public.hr_staff_change_requests.id;

CREATE SEQUENCE IF NOT EXISTS public.hr_leave_requests_id_seq AS integer
 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE TABLE IF NOT EXISTS public.hr_leave_requests (
 id integer NOT NULL DEFAULT nextval('hr_leave_requests_id_seq'::regclass),
 employee_id character varying(80),
 employee_name character varying(200) NOT NULL,
 leave_type character varying(60) DEFAULT 'Annual'::character varying,
 start_date date NOT NULL,
 end_date date NOT NULL,
 reason text,
 status character varying(40) DEFAULT 'pending'::character varying,
 approved_by character varying(120),
 approved_at timestamp with time zone,
 created_by character varying(120),
 created_at timestamp with time zone DEFAULT now(),
 updated_at timestamp with time zone DEFAULT now(),
 urgent boolean DEFAULT false,
 rejection_reason text,
 notes text,
 CONSTRAINT hr_leave_requests_pkey PRIMARY KEY(id)
);
ALTER SEQUENCE public.hr_leave_requests_id_seq OWNED BY public.hr_leave_requests.id;
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_employee ON public.hr_leave_requests USING btree(employee_name);
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_status ON public.hr_leave_requests USING btree(status);

CREATE TABLE IF NOT EXISTS public.stock_batches (
 id character varying(60) NOT NULL,
 barcode character varying(80),
 carton_no character varying(120),
 description character varying(255),
 batch_no character varying(120),
 expiry_date date,
 quantity numeric(14,2) DEFAULT 0,
 total_ctns numeric(14,2) DEFAULT 0,
 import_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
 location character varying(120),
 status character varying(30) DEFAULT 'available'::character varying,
 dispatched_quantity numeric(14,2) DEFAULT 0,
 remaining_quantity numeric(14,2) DEFAULT 0,
 product_id character varying(120),
 warehouse_id character varying(60),
 metadata jsonb,
 created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
 updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
 unit_price numeric(12,2) DEFAULT '0'::numeric,
 notes text,
 cif_unit_cost numeric(14,2) DEFAULT '0'::numeric,
 cif_total_value numeric(14,2) DEFAULT '0'::numeric,
 dpc_unit_value numeric(14,2) DEFAULT '0'::numeric,
 dpc_total_value numeric(14,2) DEFAULT '0'::numeric,
 supplier_name character varying(255),
 import_reference character varying(255),
 supplier_import_id character varying(60),
 qr_code character varying(200),
 original_unit_cif numeric,
 original_unit_dp numeric,
 CONSTRAINT chk_sb_dispatched_qty_gte_zero CHECK(dispatched_quantity >= 0::numeric),
 CONSTRAINT chk_sb_remaining_qty_gte_zero CHECK(remaining_quantity >= 0::numeric),
 CONSTRAINT stock_batches_barcode_key UNIQUE(barcode),
 CONSTRAINT stock_batches_pkey PRIMARY KEY(id)
);
CREATE INDEX IF NOT EXISTS cost_stock_location_product ON public.stock_batches USING btree(lower(TRIM(BOTH FROM location)),lower(TRIM(BOTH FROM description))) WHERE remaining_quantity > (0)::numeric;
CREATE INDEX IF NOT EXISTS cost_stock_warehouse_product ON public.stock_batches USING btree(lower(TRIM(BOTH FROM warehouse_id)),lower(TRIM(BOTH FROM description))) WHERE remaining_quantity > (0)::numeric AND (location IS NULL OR location::text = ''::text);
CREATE INDEX IF NOT EXISTS idx_stock_batches_description ON public.stock_batches USING btree(description);
CREATE INDEX IF NOT EXISTS idx_stock_batches_location ON public.stock_batches USING btree(location);
CREATE INDEX IF NOT EXISTS idx_stock_batches_product ON public.stock_batches USING btree(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_batches_qr_code ON public.stock_batches USING btree(qr_code) WHERE qr_code IS NOT NULL;

-- No notify_change function or NOTIFY trigger exists in the authorized snapshot.
-- Internal foreign-key triggers are created by their authoritative constraints;
-- incoming barcode_batch_events FK is defined by existing migration 010.
DO $canonical_triggers$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger
   WHERE tgrelid='public.products'::regclass AND tgname='products_updated_at') THEN
  CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger
   WHERE tgrelid='public.product_images'::regclass AND tgname='product_images_updated_at') THEN
  CREATE TRIGGER product_images_updated_at BEFORE UPDATE ON public.product_images FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
 END IF;
END
$canonical_triggers$;
