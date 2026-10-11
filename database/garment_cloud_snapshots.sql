-- PremierOS Garments: additive, owner-scoped cloud backups on shared AMMCO Supabase.
-- Existing AMMCO tables and data are not altered.
-- This is manual backup/restore, NOT a multi-user production ledger.
CREATE TABLE public.garment_cloud_snapshots (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT garment_cloud_snapshots_payload_valid CHECK ((
    jsonb_typeof(payload) = 'object'
    AND payload->>'version' = '1'
    AND jsonb_typeof(payload->'styles') = 'array'
    AND jsonb_typeof(payload->'materials') = 'array'
    AND jsonb_typeof(payload->'orders') = 'array'
    AND jsonb_typeof(payload->'ledger') = 'array'
    AND jsonb_typeof(payload->'finished') = 'array'
    AND jsonb_typeof(payload->'audit') = 'array'
  ) IS TRUE),
  CONSTRAINT garment_cloud_snapshots_size_limit CHECK (pg_column_size(payload) <= 4194304)
);
COMMENT ON TABLE public.garment_cloud_snapshots IS
  'Isolated PremierOS Garments manual cloud backups; never use for concurrent production updates.';
ALTER TABLE public.garment_cloud_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garment_cloud_snapshots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.garment_cloud_snapshots FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.garment_cloud_snapshots TO authenticated;
CREATE POLICY garment_cloud_snapshots_owner_select
  ON public.garment_cloud_snapshots FOR SELECT TO authenticated
  USING (owner_id = (select auth.uid()));
CREATE POLICY garment_cloud_snapshots_owner_insert
  ON public.garment_cloud_snapshots FOR INSERT TO authenticated
  WITH CHECK (owner_id = (select auth.uid()));
CREATE POLICY garment_cloud_snapshots_owner_update
  ON public.garment_cloud_snapshots FOR UPDATE TO authenticated
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
CREATE POLICY garment_cloud_snapshots_owner_delete
  ON public.garment_cloud_snapshots FOR DELETE TO authenticated
  USING (owner_id = (select auth.uid()));
CREATE FUNCTION public.garment_cloud_snapshots_touch()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.garment_cloud_snapshots_touch() FROM PUBLIC, anon;
CREATE TRIGGER garment_cloud_snapshots_updated_at
BEFORE UPDATE ON public.garment_cloud_snapshots
FOR EACH ROW EXECUTE FUNCTION public.garment_cloud_snapshots_touch();
