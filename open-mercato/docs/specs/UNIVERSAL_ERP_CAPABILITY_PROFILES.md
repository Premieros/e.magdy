# Universal ERP capability profiles

Architecture proposal, 2026-10-13. Documentation only, not an implemented feature.

## One source of truth
Use the installed Open Mercato authority for directory/auth, catalog/variants, WMS inventory, sales, and supported payment allocations. Do not duplicate stock balances, orders, payments, or general ledgers. Procurement and accounting require contract review before implementation. Domain-specific operational records may reference canonical identifiers but must not become alternate ledgers.

## Organization-specific capabilities
Each organization independently selects restaurant, garment manufacturing, retail, services, or several profiles. Server authorization must enforce tenant/organization/branch boundaries; UI visibility alone is insufficient. Assess built-in configs and feature toggles before adding profile tables.

Restaurant profile: dining tables/areas, bookings, kitchen display and station stages, recipes, modifiers, split/merge bills, dine-in/takeaway/delivery, shifts, ingredient waste, refunds and settlement.

Garment profile: styles, color/size variants, material rolls, BOM revisions, cutting, work orders, quality, production costing, wholesale and retail.

Retail profile: products, channels, pricing, warehouse receiving, sales, delivery, returns, receipts.

Services profile: services without stock, scheduling, jobs, deposits, completion and refunds.

## Safe test plan
Build an isolated, deterministic fixture runner only after inspecting official 0.9.0 APIs and receiving approval for a separate test environment. Seed distinct restaurant, garments, retail, services, mixed-profile organizations with branches and role-scoped users. Include menu variants, kitchen tickets, tables, fabric rolls, garment color/size SKUs, purchase orders with partial receipts, WMS movements, sales, shipments, returns, payment allocations and reconciliations. Generate a test manifest from actual authoritative command results, never by direct inserts into core records. Refuse execution against production.

Discover all active application screens from installed routes and generate a screen coverage matrix. Test role access, tenant and branch isolation, create/read/update where supported, empty/error states, Arabic RTL, responsiveness, and links to canonical documents. Test duplicate and concurrent receipts, fulfilments and tenders, partial receipt/delivery, refunds, production material issue, kitchen cancellation, stock-payment-accounting reconciliation. Mark scenarios blocked when required modules are not implemented.

## Reference repositories
Read-only review of Premieros/.com CODEMAP.md and DEPENDENCY_MAP.md: dining floor, shifts, recipes, purchases and finance features serve as requirement references, not portable implementations. Premieros/AMMCO README.md illustrates duplicate-safe reporting imports but AMMCO remains independent. No changes to any reference repo or database.

## Release gates
Inspect official pinned contracts; map each route and command to its owner; identify missing providers; propose narrowly scoped DDL for prior explicit approval; run tests exclusively in approved isolation; produce CI/build and reconciliation evidence; prepare reviewed PR without merge or deployment.

Current state: architecture and test specification only. No sample data inserted and no operational workflow newly implemented.
