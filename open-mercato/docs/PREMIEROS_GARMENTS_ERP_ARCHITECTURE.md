# PremierOS Garments — ERP architecture and staged integration plan

**Status:** Architecture decision approved by project owner (2026-10-12)  
**Baseline:** Open Mercato `0.9.0` on Next.js `16.3.6`  
**Repository:** `Premieros/e.magdy` · branch `deploy/garments-mercato`  
**Deployment:** Vercel `premieros-garments-mercato`  
**Only permitted database:** Supabase project `yumeijsyiphzdsulsubf`, PostgreSQL schema `garments_ops`  
**Forbidden:** touching AMMCO tables, using another Supabase project, or making a second operational ERP.

## ADR-001 — One platform, bounded modules

Use Open Mercato as the **only** ERP foundation: users, tenants, organizations, products,
SKU variants, customers, stock movements, reservations, orders, shipments, invoices,
and payments stay in their corresponding core modules. Build clothing manufacturing
as application-owned modules under `open-mercato/src/modules/<module_id>/`, enabled
explicitly via `src/modules.ts`. Extend through public interfaces, commands,
events, custom fields / UMES, DI, and role features. No core forks, direct edits
to `node_modules`, duplicate stock/sales/auth ledgers, or new browser-local
source of truth.

The legacy PremierOS localStorage application is a **functional reference and
candidate migration source**, never a second production database or independently
deployed source of truth. Its garments logic must be rewritten/adapted to server
commands; it must not be pasted wholesale into the new ERP.

## Verified as-is inventory (read-only audit on 2026-10-12)

- `garments_ops`: **145 base tables**, **107 PostgreSQL foreign keys**, **0 garment-prefixed tables**;
  `tenants`, `organizations`, and `users`: **0 rows** at audit time.
- Enabled in `src/modules.ts`: `auth`, `directory`, `configs`, `entities`,
  `query_index`, `api_docs`, `audit_logs`, `notifications`, `dashboards`,
  `events`, `search`, `attachments`, `customers`, `progress`,
  `dictionaries`, `feature_toggles`, `catalog`, `sales`, `wms`, `currencies`.
- No deployed dedicated purchases/accounting tables were found in the allowed
  schema; **do not describe either subsystem as implemented**.
- **0 of 145 base tables currently have PostgreSQL RLS enabled.** The system
  must not allow public browser clients/direct SQL to access this schema.
  Verify per-request server authorization and tenant/org scoping, least-
  privilege DB role, and whether additional RLS is compatible with the
  framework before onboarding real users. Enabling RLS on vendor tables is
  not a blanket blind change: plan/test approved migrations first.
- `catalog_product_variants` provides SKUs; `catalog_product_options`,
  `catalog_product_option_values`, and variants' option values can represent
  size and color. `catalog_product_unit_conversions` supports unit mappings.
- WMS has warehouses, zones, locations, lots, movements, balances and
  reservations; current version's command implementation uses an append-only
  movement ledger, explicit reversals, transaction handling and idempotency.
  **Important limitation:** inventory movement/reference enums in v0.9.0 do
  not express a dedicated manufacturing issue/receipt operation. Formalize
  that extension contract before production go-live, rather than abusing
  generic adjustments as invisible production postings.
- Sales provides customer orders/lines, quotations, shipments, invoices,
  returns/credit memos, payment allocations, with product snapshots.
- PostgreSQL relations are mostly inside modules. Cross-module UUID references
  require validated service/command checks; do not add cross-module ORM
  entity relations against the installed framework contract.

## Ownership map — no competing truths

| Business concept | Authority | Apparel extension |
|---|---|---|
| User, roles, ACL, session, tenant, organization | `auth`, `directory` | App-specific roles/features via normal setup |
| Supplier/customer identity | `customers` | Supplier attributes/tags, no duplicate people master |
| Fabric/accessory product, finished garment style, SKU, color, size | `catalog` | Apparel custom fields and reusable option templates |
| Warehouse, location, lot, on-hand, reserved, movement | `wms` | Fabric-roll details, work-order movement references (no second balance) |
| Customer wholesale order, shipment, invoice, return, payment | `sales` | Size/color grid UI and work-order demand links (no new sales ledger) |
| Released BOM, consumption factors, wastage, routing | `garments_engineering` (new) | Versioned manufacturing specification |
| Production lot, SKU work order, cutting bundle, stage completion | `garments_production` (new) | Manufacturing lifecycle; linked catalog/WMS/sales identifiers |
| Inspection, rework, scrap, acceptance | `garments_quality` (new) | Controlled quality disposition |
| WIP and labor/overhead/product-unit costing | `garments_costing` (new) | Cost breakdown/snapshot, not a general ledger |
| Purchase requisition/order/supplier invoice, full accounting | Decision gate | Assess compatible installed/open-source modules; only then implement missing capabilities |

## Logical design and data boundaries

- One primary operating tenant + organization to begin; factory/site, department,
  production line, branch and warehouse are **different** concepts. First inspect
  directory hierarchy for branch structure; only create an app-owned site/line
  table if the installed primitives do not express it. WMS warehouses always
  remain owned by an organization.
- Trust scope from authenticated server context, **never from a form or request
  body**. All new mutable records include `tenantId`, `organizationId`,
  `createdAt`, `updatedAt`, origin/user and audit metadata. Enforce immutable
  scope, unique tenant/org-local identifiers, and optimistic locking/version
  checks. Use FKs within a module where supported; validate cross-module UUIDs,
  organization scope, SKU identity, warehouse, lot and order references through
  their service/command contracts.
- Catalog product is the style/model or raw material according to type; a
  finished-garment *variant* is the **unique operational SKU**, e.g. model ×
  color × size. Do not duplicate SKU IDs in garment tables. BOM lines point to
  catalog material IDs/SKUs by validated scalar reference.
- Separate concepts: WMS *material inventory lot/roll* and
  `garments_production.production_batch` are not the same lot. A fabric roll
  can have app-owned measurements/shade/width linked to the WMS lot; WMS
  remains the authority for quantities.
- Draft conceptual entities (names subject to spec & migration review):
  - `garments_engineering`: `garment_boms`, `garment_bom_lines`,
    `garment_operation_routes`, `garment_route_steps`. Released immutable
    revision, valid-from, quantities/units, expected loss and alternatives.
  - `garments_production`: `garment_production_batches`,
    `garment_work_orders`, `garment_cutting_bundles`,
    `garment_operation_reports`, `garment_material_posting_links`.
    One batch can plan multiple color/size SKUs; create **one work order per
    SKU**. Batch creation alone must NEVER decrement raw material inventory.
  - `garments_quality`: `garment_inspections`, `garment_dispositions`
    (accepted/rework/rejected, quantity reconciliation).
  - `garments_costing`: `garment_cost_components`,
    `garment_work_order_cost_snapshots` for material, labor, overhead,
    scrap and accepted units. Historical versions not mutable.
  - Optional `garments_fabric_roll_details` linked by validated WMS lot ID
    without inventing an extra stock balance.
- Reserve material for a work order via supported WMS reservations; posting
  material issue and finished goods receipt **must atomically** reconcile
  manufacturing and WMS, using a durable idempotency key and transaction/
  command boundary where possible. If the installed WMS cannot support
  production postings and a suitable command extension, **stop at design
  gate** rather than write WMS tables directly. Reversals require separate
  authorized counter-transactions, not destructive deletes.
- Optional sales-order line -> manufacturing demand links are app-owned;
  customer sales orders and dispatch/shipment remain under `sales` and WMS.
  Reserve finished goods once and decrement stock **once** at fulfillment.
- All UI pages, forms, admin menus and APIs use Open Mercato module routes,
  shared UI/CRUD commands, translation and ACL conventions. No public
  unauthenticated production entrypoints or direct browser-to-database writes.
- Background jobs/notification workflows require a supported durable
  runner. Do not assume that a Vercel serverless request is an always-on
  worker.

## End-to-end canonical workflow

1. **Catalog**: register material and finished-product styles, size/color
   option schema, variant SKUs and units. Validate unique SKU and unit
   conversions (meters, rolls, kilograms, pieces, etc.).
2. **Engineering**: release BOM revision and routing by style / variant,
   with loss factors and planned stage rates. A work order snapshots the
   exact approved version, even if engineering later revises it.
3. **Planning**: order/forecast demand -> planned production batch with
   per-SKU quantities -> one work order per SKU. No stock posting here.
4. **Materials**: inbound fabric rolls tracked by WMS lot and app roll
   attributes; choose locations; reserve specific materials and lots
   transactionally without overbooking.
5. **Shop floor**: issue reserved material via approved WMS integration;
   cutting bundles -> sewing -> finishing; record worker/stage quantities,
   authorized variances, scrap and rework. Prevent quantities exceeding
   available input at every transition.
6. **Quality & cost**: inspect quantities, resolve disposition, snapshot
   material/labor/overhead cost per accepted piece; allocate finished SKU to
   finished-goods warehouse only after accepted receiving posting.
7. **Sales**: confirm wholesale sales order using the existing `sales`
   module (multi-style and multi-SKU capable), reserve finished goods, make
   partial deliveries against the same order, invoice/payment via existing
   sales documents, and check remaining quantities.
8. **Analytics**: trace SKU and batch cost from demand to shipment. Proper
   general-ledger posting/COGS/integrated purchases remains an explicit
   separate acceptance gate before claiming full financial ERP.

## Execution roadmap and release gates

| Phase | Deliverable | Acceptance gate |
|---|---|---|
| P0 — Boundaries & access | Pin version, database constraint/permissions map, safe bootstrap, one admin, backups/restore drill, local or isolated testing | Authenticated access, no AMMCO writes, tenant/org isolation incl. forbidden access, proven rollback |
| P1 — Catalog + warehouse master | Models, dimensions/options, SKU rules, fabric/accessory UOM, 3 logical warehouse flows, material roll metadata | One SKU for one model/color/size; location-level balances come only from WMS; roles enforced |
| P2 — Engineering | Versioned BOM, waste factors, routing, per-SKU manufacturing batch plan | Released BOM cannot be edited in place; same production plan does not double-issue |
| P3 — Materials & factory execution | WMS production posting contract, reservations, work orders, bundles and operation reporting | 2 concurrent requests cannot over-reserve/over-issue; retries do not duplicate movements; auditable reversals |
| P4 — Quality & costing | Incoming/stage/final QC, rejection/rework, actual material+labor+overhead snapshots | Accepted+rejected+rework reconciles; no release of rejected goods; historical costs stable |
| P5 — Sales & procurement decision | Native wholesale order grid, partial fulfillment, shipment/invoice integration, evaluate supplier purchasing capability | No second sales table/stock book; duplicate delivery rejected; invoices match shipments; purchasing either certified or gap disclosed |
| P6 — Accounting and later AI | Accounting capability evaluation and cost-of-goods integration; then optional agents/forecasting | Accounting not claimed until balanced reconciliations; agents read authorized data, require human approval for writes |

Phases P1–P5 can be split into individually reviewed vertical slices, each with
schema/contract/design/test/release gates. **Do not enable irreversible stock
or payment operations in production by merely deploying screens.**

## Non-negotiable engineering rules

1. Plan then code: spec-first for every new API/entity/contract; inspect exact
   installed `0.9.0` framework contracts and extension guide; use Open
   Mercato's module scaffold, DI, commands and module setup conventions.
2. No blind SQL changes: generate proposed migrations, review scoped DDL,
   ensure only `garments_ops` can be modified, obtain explicit approval,
   backup, apply and verify. No `db:greenfield`/reinstall/reset.
3. Preserve upstream package version pin until upgrade compatibility review.
   Never edit vendor migrations, `node_modules`, or generated code.
4. Server-authorized commands with tenant/org context; explicit capability
   checks (not hardcoded role names), validation, concurrency locks,
   idempotency keys, audit entries and post-commit events.
5. Preserve source-of-truth boundaries: no shadow balance, alternate
   inventory-ledger tables, cloned wholesale order/invoice entities or
   localStorage operational writes.
6. Tests must cover negative authorization, multi-org isolation, stale
   updates (409), repeat commands, concurrent issue/reserve/ship, partial
   shipments, BOM changes, rework and reconciliations. CI validation:
   generation, typecheck, lint, tests and build; integration/E2E in
   isolated schema before limited pilot.
7. RLS is currently disabled for the vendor's tables. Decide and document
   supported DB policy explicitly; avoid exposing direct Postgres access
   to user browsers, and never claim database-enforced row isolation without
   implementing and proving it.
8. Treat legacy local data as **untrusted import inputs**, not canonical
   migrated records. Design `import -> validate -> preview -> confirm -> map
   IDs -> reconcile` using a disposable test schema and deduplication;
   never directly copy old local snapshots into production.
9. Factory rollout: demo/fixture data in isolated testing, single-factory
   pilot with approved transactions, reconciliation, restore drill, then
   live operations. No real payroll/personal data before access review.

## First implementation slice (P0 -> P1)

1. Establish first tenant/organization/admin securely via the existing
   guarded bootstrap. This action is still **pending**; it must not be
   bypassed with demo credentials. It need not block architecture work.
2. Produce a machine-checkable map of the *existing* catalog, WMS, sales
   and scope keys/constraints, plus an integration contract for
   manufacturing material issue/finished receipt against pinned WMS.
3. Write a narrow P1 spec: catalog garment style and size/color SKU grid,
   material UOM model and warehouse classification; prefer installed
   custom fields/options instead of new entities unless essential.
4. Build a P1 module extension with least-privilege features, backend UI,
   validators, generated artifacts and automated tests; validate without
   production writes.
5. Review migration DDL and evidence before permitting any write to
   `garments_ops`. Record outcomes and stop/go decision for P2.

## Success definition

A production operator can follow a real order across **the same records**:
customer order -> garment SKU -> released BOM -> per-SKU work order ->
WMS material reservation/issue -> stage operations -> QC ->
WMS finished receipt -> sales shipment/invoice -> defensible
margin/cost reporting, with tested audit, isolation, concurrency and
reversal behavior. No duplicate stock decrements, duplicate invoices,
uncontrolled hardcoded credentials or AMMCO impact.
