-- Reserve a non-privileged role for Open Mercato within yumeijsyiphzdsulsubf ONLY.
-- NOLOGIN prevents connecting before a private password and secure deployment are configured.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='garments_ops_login') THEN
    CREATE ROLE garments_ops_login NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
END
$role$;
GRANT USAGE, CREATE ON SCHEMA garments_ops TO garments_ops_login;
GRANT SELECT ON garments_ops.project_binding TO garments_ops_login;
ALTER ROLE garments_ops_login SET search_path = garments_ops;
COMMENT ON ROLE garments_ops_login IS 'Reserved for Open Mercato Garments; do not grant privileges on public AMMCO tables.';
