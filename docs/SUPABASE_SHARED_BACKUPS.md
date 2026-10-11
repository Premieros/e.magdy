# PremierOS Garments — shared Supabase backup (phase 1)

## Database binding

- Existing shared project (AMMCO): `yumeijsyiphzdsulsubf`
- New isolated table: `public.garment_cloud_snapshots`
- Database migration recorded as `garments_isolated_cloud_snapshots_v1`.
- **Existing AMMCO organization, branches, profiles, tables, and business rows were not changed.**
- Table definition for review: `database/garment_cloud_snapshots.sql`.

The frontend uses a **public/publishable** Supabase API key (NOT a service_role/secret key). The database enforces `owner_id = auth.uid()` for every SELECT, INSERT, UPDATE and DELETE, and has RLS enabled and forced. One authenticated user receives one backup record. The payload is JSON and limited to ~4 MB.

## Usage

1. Run the app using a local static file server.
2. Navigate to **النسخ الاحتياطي**.
3. Sign in with **an existing Supabase Auth account** on the AMMCO project using the password form in the app. Credentials must NEVER be sent through chat or committed.
4. Click **رفع نسخة الجهاز إلى السحابة** to replace **your own** cloud backup with the current local data.
5. Click **استرجاع نسخة السحابة** to replace local data with your last cloud backup. The browser initiates a download of the old local data first.
6. Sign out after the session. The access token is kept in memory only and is lost on page reload.

The shared project has an AMMCO-specific Auth signup trigger, so the Garments UI deliberately **does not offer sign-up**. Account provisioning needs separate review to avoid affecting AMMCO.

## Limitations and non-goals

- This is **manual backup/restore, not production synchronization**; the app still modifies localStorage as before.
- Saving from two devices may overwrite the other device's latest cloud backup. There is no conflict merging, history, or optimistic concurrency yet.
- JSON snapshots are useful for trial data and recovery, but do not provide per-operation transaction integrity, multi-user team roles, or independent factory organizations.
- **Do not enter real sensitive staff/customer or financial data** until normalized production tables, authorization, audit logging, and backups are complete.
- Shared Auth is not factory-specific. Existing AMMCO Auth users may authenticate, but the new table does not grant access to AMMCO application data.
- A future enterprise release should use its own Supabase project/Auth realm where possible. If a shared project is required, use separately reviewed garment organization tables and tenant-scoped RLS, never a cross-company fallback.

## Verification

- Database SQL checked that RLS is enabled and forced with four owner-only policies, and the table initially has no records.
- Unit tests validate snapshot shapes, client auth and owner-bound REST requests **with mocked HTTP**.
- Integration using a real user is not validated yet (requires a valid existing Supabase Auth account).
- Supabase Security Advisor reported "Leaked Password Protection Disabled" at the project level; see https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Future migration order

1. Identity and factory organization/branch/warehouse membership, tenant-scoped RLS.
2. Normalized garment styles, size/color variants, materials, rolls and BOM versions.
3. Atomic inventory movements, cutting/WIP stage events, QC and labor costing with idempotency keys.
4. Test migration from local backup JSON with dry-run and ledger reconciliation.
5. Multi-user login and conflict-safe UI API; stop using localStorage as authoritative inventory.
