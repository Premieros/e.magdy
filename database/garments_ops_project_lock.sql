-- Project lock: PremierOS Garments can use ONLY yumeijsyiphzdsulsubf.
-- Additive migration. All AMMCO public objects and existing public garment_ tables remain untouched.
BEGIN;
CREATE SCHEMA IF NOT EXISTS garments_ops;
REVOKE ALL ON SCHEMA garments_ops FROM PUBLIC, anon, authenticated;
COMMENT ON SCHEMA garments_ops IS
  'Isolated Open Mercato Garments workspace; only in Supabase project yumeijsyiphzdsulsubf. AMMCO public schema MUST NOT be modified by Open Mercato.';
CREATE TABLE IF NOT EXISTS garments_ops.project_binding (
  singleton boolean NOT NULL DEFAULT true PRIMARY KEY CHECK (singleton),
  project_ref text NOT NULL CHECK (project_ref = 'yumeijsyiphzdsulsubf'),
  target_schema text NOT NULL CHECK (target_schema = 'garments_ops'),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ALL TABLES IN SCHEMA garments_ops FROM PUBLIC, anon, authenticated;
INSERT INTO garments_ops.project_binding (singleton, project_ref, target_schema)
VALUES (true,'yumeijsyiphzdsulsubf','garments_ops')
ON CONFLICT (singleton) DO NOTHING;
DO $guard$
BEGIN
  IF (SELECT count(*) FROM garments_ops.project_binding
      WHERE singleton AND project_ref = 'yumeijsyiphzdsulsubf'
      AND target_schema = 'garments_ops') <> 1 THEN
    RAISE EXCEPTION 'Garments project binding mismatch: refusing activation';
  END IF;
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'Unexpected database: refusing garments activation';
  END IF;
END
$guard$;
COMMIT;
