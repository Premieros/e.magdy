# PremierOS Garments → Open Mercato: isolated operational pilot

## Status

**The WMS scaffold is generated successfully by GitHub Actions; the new framework is not yet installed, configured with a database, deployed, or populated with real factory data.**

- Existing production preview remains **unchanged** at https://premieros.github.io/e.magdy/
- Pilot branch: `feat/open-mercato-operational-pilot`
- GitHub Actions workflow: `Open Mercato isolated WMS scaffold pilot`
- Source: https://github.com/open-mercato/open-mercato
- Official generator: `create-mercato-app@0.9.0` (Node.js 24)
- Preset: `wms`. It supplies auth, tenant context, customers, catalog, sales, warehouse/WMS, auditing and required base dependencies.
- New application name inside generated artifact: `garments-ops`.
- Data: **no database is created or modified**. No login identities, passwords, production data or Supabase changes are involved.

### Generating the pilot yourself

With Node.js 24, at the repository root:

```bash
bash pilot/open-mercato/bootstrap.sh /an/empty/output/path
```

The command produces `/an/empty/output/path/garments-ops` from the pinned official CLI. The GitHub Actions run also uploads **premieros-open-mercato-wms-scaffold** as an artifact (a gzipped project source snapshot; check artifact retention in the run).

Note: this is **source scaffolding only**. It has not passed a complete `yarn setup`, migration, typecheck, full build, service deployment, staff login or live order workflow on a dedicated database. Do not label it production-ready.

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

1. Create **a separate, non-AMMCO** PostgreSQL environment and protected app deployment. Keep credentials in deployment secrets, never commit `.env`.
2. Initialize Open Mercato with that isolated database and authenticate the factory manager with a newly provisioned app identity; do **not** assume the existing Supabase password/session can be silently migrated.
3. Add a dedicated garments module with a versioned BOM and order lifecycle through the supported Open Mercato module framework (do not patch core).
4. Test server-transactional consumption and receipts, stock isolation by tenant/warehouse, idempotent deliveries, and cost traceability.
5. Add an explicit **reviewed** legacy data import, with a dry-run discrepancy report, rollback, mapping table, and end-to-end reconciliation.
6. Keep original GitHub Pages client as the non-production preview until an end-to-end scenario — quote → approval → production → QC → shipment — works on two real staff accounts.

## Security and licensing

- The generator runs in a CI job with `contents: read`, no production DB credentials, no Supabase connection, no deployment token, and no write permissions.
- CI checks six foundational WMS modules and excludes `.env` and `.env.local` from the generated artifact.
- [Open Mercato MIT](THIRD_PARTY_LICENSE.txt) requires retaining copyright/license notices; the generated app must keep attribution and undergo a separate dependency license review.
- No AMMCO tenant, Supabase table, existing Auth user, original PremierOS POS repository, live GitHub Pages workflow or production data was altered.
