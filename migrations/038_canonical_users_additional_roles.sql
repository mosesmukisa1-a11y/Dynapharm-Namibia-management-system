-- Only the authorized users column, not a reconstruction of the whole table.
-- Additive and idempotent: no conversion, role assignment or session mutation.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS additional_roles jsonb DEFAULT '[]'::jsonb;
