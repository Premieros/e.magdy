-- PremierOS Garments: secure tenant-bound order intake in shared Supabase.
-- Additive. Does NOT change AMMCO tables, triggers, or user roles.
CREATE TABLE public.garment_factories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code text NOT NULL UNIQUE CHECK (length(code) BETWEEN 3 AND 60 AND code ~ '^[a-z0-9-]+$'),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.garment_staff (
 factory_id uuid NOT NULL REFERENCES public.garment_factories(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('owner','manager','sales','production','inventory','viewer')),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (factory_id, user_id)
);
CREATE INDEX garment_staff_user_active_idx ON public.garment_staff (user_id, factory_id) WHERE active;
CREATE TABLE public.garment_intake_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factory_id uuid NOT NULL REFERENCES public.garment_factories(id) ON DELETE RESTRICT,
 customer_name text NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 2 AND 120),
 customer_contact text NOT NULL DEFAULT '' CHECK (length(customer_contact) <= 160),
 notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
 lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) BETWEEN 1 AND 50 AND pg_column_size(lines) <= 32768),
 status text NOT NULL DEFAULT 'new' CHECK (status = 'new'),
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT garment_intake_unique_factory_id UNIQUE (factory_id,id)
);
CREATE INDEX garment_intake_factory_created_idx ON public.garment_intake_orders(factory_id,created_at DESC);
CREATE FUNCTION public.garment_intake_validate_lines(payload jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN jsonb_typeof(payload) <> 'array' THEN false
             WHEN jsonb_array_length(payload) NOT BETWEEN 1 AND 50 THEN false
             ELSE NOT EXISTS (
               SELECT 1 FROM jsonb_array_elements(payload) l
               WHERE jsonb_typeof(l) <> 'object'
                  OR jsonb_typeof(l->'sku') IS DISTINCT FROM 'string'
                  OR length(btrim(l->>'sku')) NOT BETWEEN 1 AND 80
                  OR jsonb_typeof(l->'qty') IS DISTINCT FROM 'number'
                  OR coalesce((l->>'qty') !~ '^[0-9]+$',true)
                  OR CASE WHEN (l->>'qty') ~ '^[0-9]{1,7}$'
                    THEN (l->>'qty')::integer NOT BETWEEN 1 AND 1000000
                    ELSE true END
                  OR jsonb_typeof(l->'unitPrice') IS DISTINCT FROM 'number'
                  OR coalesce((l->>'unitPrice') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$',true)
                  OR length(coalesce(l->>'size','')) > 40
                  OR length(coalesce(l->>'color','')) > 60
             )
 END;
$$;
REVOKE ALL ON FUNCTION public.garment_intake_validate_lines(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.garment_intake_validate_lines(jsonb) TO authenticated;
ALTER TABLE public.garment_intake_orders
  ADD CONSTRAINT garment_intake_lines_valid CHECK (public.garment_intake_validate_lines(lines));
ALTER TABLE public.garment_factories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garment_factories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.garment_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garment_staff FORCE ROW LEVEL SECURITY;
ALTER TABLE public.garment_intake_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garment_intake_orders FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.garment_factories,public.garment_staff,public.garment_intake_orders FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.garment_factories,public.garment_staff TO authenticated;
GRANT SELECT,INSERT ON public.garment_intake_orders TO authenticated;
CREATE POLICY garment_staff_self_select
  ON public.garment_staff FOR SELECT TO authenticated
  USING (user_id=(select auth.uid()));
CREATE POLICY garment_factory_member_select
  ON public.garment_factories FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.garment_staff s WHERE s.factory_id=garment_factories.id
    AND s.user_id=(select auth.uid()) AND s.active));
CREATE POLICY garment_intake_member_select
  ON public.garment_intake_orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.garment_staff s WHERE s.factory_id=garment_intake_orders.factory_id
    AND s.user_id=(select auth.uid()) AND s.active));
CREATE POLICY garment_intake_sales_insert
  ON public.garment_intake_orders FOR INSERT TO authenticated
  WITH CHECK (
    created_by=(select auth.uid())
    AND status='new'
    AND EXISTS (SELECT 1 FROM public.garment_staff s WHERE s.factory_id=garment_intake_orders.factory_id
      AND s.user_id=(select auth.uid()) AND s.active
      AND s.role IN ('owner','manager','sales'))
  );
CREATE FUNCTION public.garment_intake_set_creator()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  NEW.created_by := auth.uid();
  NEW.created_at := now();
  NEW.status := 'new';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.garment_intake_set_creator() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER garment_intake_audit_defaults BEFORE INSERT ON public.garment_intake_orders
 FOR EACH ROW EXECUTE FUNCTION public.garment_intake_set_creator();
COMMENT ON TABLE public.garment_intake_orders IS
 'Garments-only, authenticated tenant-scoped order intake. Immutable draft requests until reviewed workflow is built.';
