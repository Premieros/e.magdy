# PremierOS Garments — administrator recovery completed

Updated: 2026-10-13.

## Installation and access

- Existing repository: Premieros/e.magdy.
- Production branch: deploy/garments-mercato.
- Vercel project: premieros-garments-mercato (prj_cJZuRsheb50NS5hpy1ePrnA83IBB).
- Open Mercato core: 0.9.0; installed MikroORM: 7.2.4 from the committed lockfile.
- Login: https://premieros-garments-mercato.vercel.app/login?role=superadmin
- Administrator: sayed3la2@gmail.com, confirmed, with the existing tenant's superadmin role.

The owner uses the initial password they privately configured in Vercel and must change it after first sign-in. No password, token, database URL, root encryption key, or ciphertext is included in this document.

## Verified state

The restricted operator verification confirmed one tenant, one PremierOS Garments organization, three existing roles, and one administrator. Official owner recovery verified exactly one user-role link and synchronized the role ACLs.

Only the four published api_keys migrations were applied, using garments_ops_login and the exclusive garments_ops search_path:

1. Migration20251030150038
2. Migration20260116225251
3. Migration20260125204102
4. Migration20260523234901

Their exact ordered history is recorded in garments_ops.mikro_orm_migrations_api_keys. The migration runner verified zero API keys and the four added session columns. There was no general migration, manual user insert, second tenant/organization setup, or mutation through a privileged DB account.

Live verification confirmed:
- The encrypted owner email decrypts correctly through the official KMS.
- POST /api/auth/login returns 200.
- The signed token carries the expected owner email, tenant, organization and superadmin role.
- The authenticated GET /backend returns 200.
- Logout removes the test session; no verification token or cookie was retained.

## Permanent security and runtime configuration

The only permitted Supabase project is yumeijsyiphzdsulsubf. All application data and ORM metadata stay in garments_ops under garments_ops_login. AMMCO schemas are outside this operation.

TENANT_DATA_ENCRYPTION is explicitly true. The official Open Mercato DerivedKmsService uses a permanent high-entropy TENANT_DATA_ENCRYPTION_FALLBACK_KEY stored as a Vercel Production Secret. Preserve that key: replacing or deleting it without an approved cryptographic migration makes existing ciphertext unreadable. This is the published KMS implementation, not custom encryption or a development default.

Serverless runtime selects the same restricted pooler endpoint on transaction port 6543; target, username, password and exclusive schema options are preserved and TLS verification remains enabled. A read-only preflight verified the actual DB principal and search_path. Maintenance scripts keep their session connection for advisory-lock semantics.

Application connections are bounded by DB_POOL_MIN=0, DB_POOL_MAX=3 and DB_POOL_IDLE_TIMEOUT=1000. Query-index warmup is staggered (concurrency 1, stagger 1000 ms) rather than opening a burst above the session-pool limit.

The backend home now invokes the same full bootstrap used by backend catch-all pages before resolving canonical session integrity. This fixed the /backend → session-refresh redirect loop without bypassing authentication.

## Recovery is finished

The old initial auth-setup build gate is disabled. Regular builds do not run owner recovery or migrations.

GARMENTS_SETUP_ADMIN_PASSWORD was emptied after live verification, and GARMENTS_SETUP_ADMIN_EMAIL was cleared. One-off migration/recovery/verification approvals were scoped to explicit build commands or child processes, never persisted as project-wide approvals. The permanent KMS/JWT/auth/database secrets remain in place.

Older immutable deployment environments can retain the old temporary password; changing the owner's password in the application invalidates it. Never reactivate the initial bootstrap, rerun auth setup, run a general migration, or reset this shared installation.

The guarded operator and verification scripts remain available for reviewed maintenance only. They stop on a mismatched project, branch, commit, principal, schema, recorded migration prefix, owner state or cryptographic prerequisite. Do not retry a failed operation without inspecting its exact recorded state.
