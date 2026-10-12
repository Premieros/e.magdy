# P1 — Garments catalog & SKU matrix (spec-first)

Status: **implementation in progress on isolated feature branch**, not production-ready  
Baseline: Open Mercato 0.9.0; Next 16.3.6  
Authority: [ERP architecture](../../docs/PREMIEROS_GARMENTS_ERP_ARCHITECTURE.md)

## Problem and ownership

Garments need a consistent model/style × color × size matrix with one SKU per
combination and one planned production quantity per SKU. Legacy PremierOS did
this in browser `localStorage`; Open Mercato `catalog` must become the only
persistent catalog owner. No separate garment SKU master or stock ledger.

- Canonical style/model: `catalog_products`.
- Canonical color, size definitions: `catalog_product_options`,
  `catalog_product_option_values`, and their variant assignments.
- Canonical SKU: `catalog_product_variants` + variant option assignments.
- Stock and reservations: `wms`; sales line identities: `sales`.
- Garments app module `garments_catalog`: validation, read-only production
  planning grid mapping to **existing** catalog variant IDs; never a catalog
  replacement.

## Slice A: deterministic planning grid (this branch)

Build `src/modules/garments_catalog/lib/sku-matrix.ts`:
1. Accept one **trusted server-resolved** canonical catalog style and its
   variant option mappings, authenticated tenant/org scope, and proposed
   strictly positive integer quantities for requested combinations. Raw browser data
   may supply requested cells ONLY; the trusted variant metadata must come
   from catalog authorization-checked server commands.
2. Require all catalog variants from the same `tenantId`,
   `organizationId` and `productId`, a nonempty unique SKU, a unique
   variant ID and one variant per color/size pair.
3. Map each requested pair to an existing **active** variant. Never generate
   new SKUs, infer an SKU from style name, or write stock.
4. Reject duplicate requested cells, nonexistent/inactive combinations,
   invalid quantities, unsafe integers, oversized grids/totals, cross-scope
   variants, malformed codes/identifiers. Do not silently merge duplicates.
5. Normalize codes and output deterministic row order, each with
   `productVariantId`, `sku`, `colorCode`, `sizeCode` and quantity.
6. No database table or migration, no public route and no unauthenticated
   browser endpoint in Slice A. Unit-test the validation independently of
   Vercel/Supabase; failure must be fail-closed.

## Slice B: catalog integration (subsequent reviewed change)

Read option schemas/variant option assignments through installed Open
Mercato catalog QueryEngine/DI interfaces. Server-side tenant/org
authorization is mandatory. Design matrix editor on the built-in backend
UI, localized AR/EN, without bypassing catalog product mutation commands.
Expose read-only preview in an authenticated endpoint only after its route
metadata + OpenAPI contract + ACL gates have been inspected and tested.
Caution: product variants do **not** store color/size in dedicated SQL columns;
they must be resolved through the canonical option mapping.

## Slice C: manufacturing input (P2)

Create a *new* app-owned production-batch/line record only after reviewed
migrations. Consume the validated matrix to instantiate one work order per
variant. **No inventory issue or WMS reservation on planning-preview calls.**
Store approved BOM revision and order demand links through validated module
contracts. Do not duplicate sales documents.

## Required negative/positive tests

- 3 sizes × 2 colors -> 6 unique existing SKU variants, deterministic order.
- Color/size codes differ only in case/spacing -> reject duplicate cells.
- Missing SKU, repeated SKU, repeated variant ID/pair, inactive variant,
  wrong style or tenant/org -> reject.
- Missing pair, malformed codes, fractional/zero/negative/NaN/overflow
  quantities, grid larger than limit -> reject.
- Raw validated preview never mutates database or inventory.
- Later integration: auth denial, multi-org leakage, concurrent version
  changes, stale catalog assignments, partial matrix, clear error i18n.

## Readiness gates

- Source changes only under `src/modules/garments_catalog` and module
  registry; never edit `node_modules` or Open Mercato core.
- `yarn generate`, test, lint, typecheck and build on isolated branch.
- Inspect catalog and WMS interface versions; do not assume sales/purchase/
  accounting integrations from table existence alone.
- No SQL/DDL in `garments_ops` until separate approval, backup and explicit
  schema-scoped migration review.
