# PremierOS Sage ↔ Open Mercato: verified parity and first read-only bridge

Date: 2026-10-15. **Status: integration candidate / no Sage deployment or database migration.**

## Product roles and canonical boundaries

- **Sage stays the product/UX owner:** repository `Premieros/johna-s`, Vite + React, routes in `src/app/routes.tsx`, data domains in `src/lib/domains/types/*`. Sage's protected production Supabase project identity is **`azzdesuowpdcoflmyezn`** per `docs/DATABASE_IDENTITY_LOCK.md`. Do not change that lock.
- **Open Mercato is a proposed domain-core supplier where parity is proven:** repository `Premieros/e.magdy`, `deploy/garments-mercato`, Open Mercato `0.9.0` package pin and `src/modules.ts`; separate Supabase project **`yumeijsyiphzdsulsubf`**, schema `garments_ops`. Do not cross-wire its restricted database login.
- These are **two distinct user and database realms**. A Sage session is not an Open Mercato session. No client-side service-role key, permissive CORS, shared JWT assumption, or direct production-to-production SQL.
- The source project `johna-s` has a single-writer fence in `docs/EXECUTION_GUARDRAILS.md` and current active-branch assignment in `docs/CURRENT_WORK_PLAN.md`. Do not change Sage main or start a parallel Sage branch until that ownership is reconciled.

## Domain-level parity decision matrix

| Domain | Sage source | Open Mercato candidate | Decision and proof gap |
|---|---|---|---|
| Users, branch and permissions | `context/AuthContext`, `context/RolesContext`, `lib/permissions`, `organization` types | `auth`, `directory`, core scope resolver | **Keep Sage authoritative**. Separate sessions, branch ID vs tenant/org scope; permission-by-permission proof needed |
| Catalog | `src/lib/domains/types/catalog.ts` `Product`, units and recipes; branch-scoped | `catalog` product/variant/offer/price kinds | **Read-only compatibility first**. One Sage product is not automatically one Mercato variant; SKU collisions and variant/default-unit ambiguity |
| Inventory | `inventory`, `inventoryLedger`, warehouse transfers, raw FIFO | `wms` balances, movements, reservations, lots | **No dual writer**. Distinct cost/FIFO/negative-stock and location semantics; transaction-level reconciliation required |
| Purchases | `trade.Purchase`, requests/RFQs/receiving | no equivalent enabled official purchasing domain in current `modules.ts` | **Keep Sage** until complete receiving/supplier/cost cycle is implemented and proven |
| POS and payments | Sage cash, restaurant tables, kitchen, delivery, print agents | native `sales` and PremierOS POS | **Keep Sage production**. Kitchen send/delta, payment idempotency, offline and print fidelity not interchangeable |
| Manufacturing/cost | `manufacturing`, `costing`, recipe/BOM and raw components | no corresponding enabled domain in current Mercato configuration | **Keep Sage**; require explicit BOM, yield, wastage and FIFO parity |
| Accounting and reports | `accounting`, `reporting`, shifts/treasury | sales invoice/payment primitives (not a verified Sage-compatible general ledger) | **Keep Sage**; reconcile journals, taxes, closures and settlements before migration |
| Printing/mobile/offline | Sage POS print agent, kitchen display/offline behavior | no proven parity in current Mercato installation | **Keep Sage unchanged** |

Source inspection: Sage `main@693cd639a28fc2655941d6bc26fcd8a8d78f9be3` and Open Mercato deployment `2291a4e7711c1ffff6e422e01670ab6ba1246f5e`. This is a code/contract audit, **not** live signed-in production E2E verification. The URL `premieros-sage.vercel.app` was not accessible through the connected Vercel scope.

## First executable integration boundary (source-side only)

The endpoint `GET /api/premier_pos/sage-catalog-preview` is intended as a deliberately limited first bridge:

1. Requires a **native Open Mercato login**, exact organization selection and native `catalog.products.view` permission.
2. Reads **only official CatalogProduct and CatalogProductVariant** for the selected tenant + organization; no Sage database reads.
3. Deterministic page of **1–100 products**, sorted by product UUID, cursor `?cursor=<last product id>`. `nextCursor` signals further pages. The returned number of *variant rows* may exceed product page size; the endpoint rejects pages with more than 2,000 variants (HTTP 413, reduce pageSize) instead of silently truncating.
4. Version `premieros.sage.catalog-preview.v1`: product ID, variant ID, suggested SKU, title, variant name/barcode, native type and active state. Explicit warnings mark missing/duplicate SKU and other unmapped domains. Read-only JSON, `Cache-Control: private, no-store`. Optional `?download=1` downloads current page.
5. **No credential sharing, Sage imports or writing.** Sage's importer is not implemented; this export alone does not mean the two production systems are connected or ready to migrate.

### Source → Sage fields explicitly not mapped

- `Sage.Product.branch_id` has no verified safe 1:1 mapping from Mercato organization/warehouse.
- `ready | manufactured` cannot be inferred from Mercato `productType` (e.g. `simple`, `configurable`).
- `sale_price`, `cost_price`, `wholesale_price`, taxes, recipes, modifier groups, kitchen stations, unit conversions, category, stocks and balances require separate contracts.
- SKU alone is not a durable cross-company global ID; all pages and Sage branches must be checked, and a mapping table should be approved before writes.

## Release gates before a real Sage-side import

1. Sage active writer finishes/pauses under its own single-writer protocol; read current branch HEAD and working log.
2. Agree on Sage branch-to-Mercato org/warehouse matrix and canonical product/variant mapping, including missing and duplicate SKU rules.
3. Introduce a **read-only Sage preview adapter** consuming validated signed-in/exported data, with no Sage writes or secrets.
4. Reconcile **record counts by branch, active status, variants, units and prices** on representative real data, including negative-stock and recipe cases. Repeated runs must not change business records.
5. Prove scope/permission denial, pagination, no cross-tenant leakage, exact-head CI and full Sage Verify before merge.
6. Only then design a one-way controlled migration/sync with mapping, idempotency, telemetry, rollback and **a single authoritative writer per domain**. This requires separate explicit approval for production data migration.

## Rollback and non-goals

This candidate adds a **GET-only** route, pure projection tests and a download link. Revert it or disable the link without any data rollback. It does not change Sage source, production passwords/roles, auth provider, currencies, costing, printing, inventory movements, or production schema.
