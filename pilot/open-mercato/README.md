# PremierOS Garments → Open Mercato: isolated operational pilot

[Vercel handoff and deployment blockers](DEPLOY_VERCEL.md)

## Status

**The WMS scaffold is generated successfully by GitHub Actions; the new framework is not yet installed, configured with a database, deployed, or populated with real factory data.**

- Existing production preview remains **unchanged** at https://premieros.github.io/e.magdy/
- Source publish branch: [`deploy/garments-mercato`](https://github.com/Premieros/e.magdy/tree/deploy/garments-mercato/open-mercato) contains the generated and guarded Open Mercato application.
- Pilot branch: `feat/open-mercato-operational-pilot`
- GitHub Actions workflow: `Open Mercato isolated WMS scaffold pilot`
- Source: https://github.com/open-mercato/open-mercato
- Official generator: `create-mercato-app@0.9.0` (Node.js 24)
- Preset: `wms`. It supplies auth, tenant context, customers, catalog, sales, warehouse/WMS, auditing and required base dependencies.
- New application name inside generated artifact: `garments-ops`.
- Database rule: **only Supabase project `yumeijsyiphzdsulsubf`**. An isolated schema `garments_ops` and an inactive NOLOGIN role have been created there. No existing AMMCO business tables or data were changed.

### Generating the pilot yourself

With Node.js 24, at the repository root:

```bash
bash pilot/open-mercato/bootstrap.sh /an/empty/output/path
```

The command produces `/an/empty/output/path/garments-ops` from the pinned official CLI. The GitHub Actions run also uploads **premieros-open-mercato-wms-scaffold** as an artifact (a gzipped project source snapshot; check artifact retention in the run).

Note: this is **source scaffolding only**. It has not passed a complete `yarn setup`, migration, typecheck, full build, service deployment, staff login or live order workflow on a dedicated database. Do not label it production-ready.


## Single Supabase project — mandatory policy

Owner instruction: **Never use any Supabase project except `yumeijsyiphzdsulsubf`.** This rule applies to staging, development, testing, production, scripts, database creation, migrations, environment variables and future AI agents. Do **not** silently fall back to another project even if deployment fails.

The shared Supabase project already contains the AMMCO business schema. Therefore this rule is combined with strict database-schema isolation:

- Approved project: `yumeijsyiphzdsulsubf`.
- Approved database: `postgres` on `db.yumeijsyiphzdsulsubf.supabase.co`, or a Supabase pooler carrying the same project ID in its username.
- Approved Open Mercato schema: `garments_ops` (not `public`).
- Approved database login: `garments_ops_login`, a role without superuser rights and without create permission on `public`.
- The login role currently has `NOLOGIN` and **cannot yet connect**. Enable it only while provisioning a private password/secrets into secured deployment settings.
- The code-side guard: [target-policy.mjs](target-policy.mjs) rejects all different projects, admin usernames, databases, schema search paths and incomplete configurations.
- The generated `package.json` scripts for `start`, `dev`, `mercato`, `initialize`, `db:migrate`, `db:greenfield`, `db:generate`, `setup` and `build` run the guard first; destructive reinstall and reset scripts are disabled.
- The scripts use `DATABASE_URL` with PostgreSQL session option `search_path=garments_ops`. Before any live migrations, verify a real connection has `current_schema() = 'garments_ops'` and cannot create objects under `public`. Client-side validation alone is not sufficient.

Mandatory private environment variable names:

```text
SUPABASE_PROJECT_REF=yumeijsyiphzdsulsubf
GARMENTS_DB_SCHEMA=garments_ops
DATABASE_URL=postgres://garments_ops_login:<PRIVATE_PASSWORD>@db.yumeijsyiphzdsulsubf.supabase.co:5432/postgres?options=-c%20search_path%3Dgarments_ops
```

This is a **placeholder**, not a usable password. Never paste a real password into GitHub, public code, a chat message, or a test. Once a secure role password exists, store the environment variable privately in the hosting service.

Database migrations already applied only on the permitted project: [garments_ops_project_lock.sql](../../database/garments_ops_project_lock.sql) and [garments_ops_restricted_role.sql](../../database/garments_ops_restricted_role.sql). Both are additive and retain all existing business tables.

## Why WMS, not copying an entire third-party ERP?

- Existing Open Mercato WMS includes operational primitives for catalog, orders, inventory, tenant scoping, permissions and audit.
- It does **not** mean garment sewing/cutting, fabric roll consumption, wages per piece, QC and BOM are already implemented: these require a dedicated Garments manufacturing module.
- Retaining the original legacy repo and GitHub Pages URL provides a reversible pilot.
- Unlike copying code from a GPL project with incompatible terms, upstream Open Mercato core is MIT-licensed. The [original MIT notice](THIRD_PARTY_LICENSE.txt) is preserved along with [attribution](ATTRIBUTION.md). All included dependencies need their own compliance inventory before distributing.

## Current app → domain mapping

See machine-readable [domain-map.json](domain-map.json):

| Existing Garments collection | Proposed Open Mercato destination |
|---|---|
| `styles`, `variants` | Catalog products + each size/color SKU |
| `materials`, `ledger` | Catalog material SKUs + WMS movements (opening stock reconciled) |
| `styles[].bom` | Custom garment BOM entity + revisioned lines |
| `fabricRolls`, `cuttingBundles` | Dedicated roll & cutting bundles module |
| `workers`, `workLogs` | Production staffing, stage logs, and piece-rate ledgers |
| `orders`, `productionBatches` | Garment work orders, production lots and stages |
| `finished` | Finished SKU receipts through WMS |
| `wholesaleOrders` | Native sales order + lines after reconciliation |
| `finishedDispatches` | Native sales shipments + WMS outflow |
| Authenticated central intake orders | Future accepted quotes, separately fetched via scoped tenant API |

**No automatic mapping has been executed.** Do not directly insert the local JSON object into Open Mercato's database. Differences in costs, shipments, tenant identity, historical timing and inventory accounting must be reconciled.

### Dry-run audit for old browser exports

After exporting JSON from the old app, privately run:

```bash
node pilot/open-mercato/audit-legacy.mjs /path/to/local-private-export.json
```

Outputs aggregate counts and blocker **codes only**; it never uploads or writes anything. Example blocking codes: `DEMO_DATA_MUST_NOT_MIGRATE`, `RAW_LEDGER_BALANCE_MISMATCH`, `NEGATIVE_FINISHED_STOCK`.

**Never commit private customer or payroll exports to GitHub**, not even to a branch. The audit deliberately reports `readyForAutomaticImport: false` until actual server mappings and migration approvals exist.

## Next verified implementation gates

1. Use **only** Supabase project `yumeijsyiphzdsulsubf` with the `garments_ops` schema and schema-limited role. Configure protected hosting and keep credentials in deployment secrets, never commit `.env`.
2. Initialize Open Mercato with that isolated database and authenticate the factory manager with a newly provisioned app identity; do **not** assume the existing Supabase password/session can be silently migrated.
3. Add a dedicated garments module with a versioned BOM and order lifecycle through the supported Open Mercato module framework (do not patch core).
4. Test server-transactional consumption and receipts, stock isolation by tenant/warehouse, idempotent deliveries, and cost traceability.
5. Add an explicit **reviewed** legacy data import, with a dry-run discrepancy report, rollback, mapping table, and end-to-end reconciliation.
6. Keep original GitHub Pages client as the non-production preview until an end-to-end scenario — quote → approval → production → QC → shipment — works on two real staff accounts.

## Security and licensing

- The generator runs in a CI job with `contents: read`, no production DB credentials, no Supabase connection, no deployment token, and no write permissions.
- CI checks six foundational WMS modules and excludes `.env` and `.env.local` from the generated artifact.
- [Open Mercato MIT](THIRD_PARTY_LICENSE.txt) requires retaining copyright/license notices; the generated app must keep attribution and undergo a separate dependency license review.
- The existing AMMCO tenant, public business tables, Auth users, original POS repository and GitHub Pages preview were not modified. Only `garments_ops` schema and an inactive database role were added inside the designated shared project.
