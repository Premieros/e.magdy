# PremierOS Garments — transaction-cycle gap audit and implementation gates

Date: 2026-10-13
Status: **Design / audit only — no production transactions, migrations, merge or deployment**
Baseline: `deploy/garments-mercato` @ `e31582f3299c01a55c9da3539c899659abd2d4e7`
Application: `open-mercato`, Open Mercato packages pinned to `0.9.0`.

## Verified from the checked-in source

- `src/modules.ts` enables official `catalog`, `sales`, `wms`, `currencies`, `customers`, `directory`, `auth`, and app-owned `premier_pos`.
- The currently enabled module list does **not** include purchase-order management or general-ledger accounting. Package presence alone does not prove functional availability.
- `package.json` pins Open Mercato packages to 0.9.0, Next.js to 16.3.6, and exposes lint, typecheck, Jest, Playwright, generate and build commands. These commands have **not yet been executed** in this audit.
- `premier_pos` is app-owned; its metadata says that it relies on native catalog and sales records. Presence of a POS route does not prove tender settlement or inventory decrement.
- The 2026-10-12 architecture note predates successful admin bootstrap and subsequent POS and API key work. Treat the user's later verified operational history as superseding those older statements.

## Strict boundaries

Work exclusively in `Premieros/e.magdy` under `open-mercato`. Database target, if later approved: Supabase project `yumeijsyiphzdsulsubf`, schema `garments_ops`, login `garments_ops_login` only. No changes to Johnas, .com, AMMCO, any other project/database, printing program or production environment. No authentication setup, admin recreation, password changes, key rotation, generated file edits, `node_modules` edits, schema reset, generic migrations or bypassing authorization. Do not use production for fake financial transactions.

## Source-of-truth mapping

| Business step | Current candidate authority | Required verification / missing decision |
| --- | --- | --- |
| Supplier identity / products / variant prices | `customers` / `catalog` | Supplier roles, channel/currency, unit conversions and pricing |
| Purchase order and supplier liability | **Unverified / not enabled** | Inspect 0.9.0 official contract; implement compatible extension only if no official provider |
| Partial/full goods receipt | `wms` ledger | Link to authorized PO line; prevent over-receipt, check exact command and reconciliation |
| Stock balance, reservations, reversals | `wms` | Idempotent posting, concurrency, warehouse/org scope |
| Sales order, shipment, return, credit memo | `sales` | Order-line fulfilment constraints, partial fulfilment, reversal invariants |
| Tender, payment allocation, settlement | `sales` + `premier_pos` | Verify real payment lifecycle and refund/allocations; no shadow cash book |
| Journal / AP / AR / COGS accounting | **Unverified / not enabled** | Select general-ledger authority and transactional posting contracts before financial rollout |

## Proposed vertical slices (implementation order)

1. **Contract discovery**: inspect installed 0.9.0 command/API code for sales, WMS, catalog and tender. Map IDs, authorized tenant and organization context, stock ledger posting triggers, order and shipment states, payment allocation semantics, returns and reversals. List missing purchase/accounting providers explicitly. Deliver a command/permission matrix.
2. **Non-mutating fixture validation**: on an approved isolated test environment, configure product/variant, supplier, channels, currency, prices, warehouse and payment method. No seeded finance records on production.
3. **Purchase + receipts**: reuse official purchase commands if present. Otherwise spec an app-owned purchase document and its lifecycle, **never** a second stock balance or sales ledger. Confirm partial receipts, over-receipt denial, organization scope and retry semantics via official WMS integration.
4. **Sales + fulfilment**: official sales order -> reservation -> partial shipment -> completion; ensure one stock decrement per shipment and exact returns/reversal linking.
5. **Collection + settlement**: official sales invoice/payment allocation -> partial/full collections -> refund/credit memo -> reconciliation. Decide what represents a cash/bank account only with the accounting authority.
6. **Accounting + costing gate**: adopt compatible GL or design reviewed extension with double-entry, posting periods, COGS and AP/AR; do not claim financially integrated ERP beforehand.
7. **Manufacturing, QC and unified reporting** only after the end-to-end commerce/service cycle passes acceptance gates.

## Acceptance test matrix — isolated environment only

| ID | Scenario | Pass requirement |
| --- | --- | --- |
| T01 | Tenant A reads/writes tenant B data | Forbidden; no leakage through search/list/detail |
| T02 | Org/branch A uses org/branch B warehouse or PO | Forbidden and audited |
| T03 | Duplicate purchase receipt request / same idempotency key | Exactly one receipt and one ledger posting |
| T04 | Two concurrent receipts against a remaining PO quantity | Cannot over-receive, atomic quantity invariant |
| T05 | Receive 4 of 10, then 6 of 10; reject 7th excess unit | PO open quantity = 0; WMS receives exactly 10 |
| T06 | Duplicate/concurrent sale shipment | Fulfilled quantity never exceeds ordered/available; stock decreases exactly once |
| T07 | Partial sale dispatch then remaining dispatch | Backorder and WMS reservations/balances reconcile |
| T08 | Return against delivered quantity and replay | Cannot return more than delivered; only authorized compensating ledger |
| T09 | Partial and final collections, duplicate tender event | Allocation does not exceed obligation; replay has no effect |
| T10 | Refund or credit memo | Stock and financial effects trace to correct original documents, no double posting |
| T11 | Failed payment and transaction rollback | No orphan paid state, inventory posting or journal |
| T12 | Cross-company branch and stale update/concurrent state transition | 403/404 per ACL design or 409 for conflict, with no partial writes |
| T13 | If accounting module approved: purchase/sale/return/refund | Every posting balances debit = credit and reconciles WMS, AR/AP and cash |
| T14 | Deployment compatibility | `generate`, `typecheck`, `lint`, `test`, `build`, isolated E2E pass |

## Migration proposal / approval boundary

**No schema migration proposed for immediate execution.** Purchase, receipt-link and journal DDL remain **TBD** pending inspection of existing 0.9.0 contracts and exact scoped schema inventory. Before ANY database operation: provide a per-object SQL diff, schema-qualified names, permissions effects, backfill/rollback, repeatability, compatibility, isolated run evidence, and obtain explicit owner approval. All allowed writes must be constrained to `garments_ops`; the other projects and schemas are strictly out of scope.

## Current blockers and next review evidence

- No approved isolated database/test tenant was identified during this repository-only assessment.
- No full installed node dependency sources or executable CI test run were inspected here; hence actual command compatibility, lifecycle completion and reconciliation are **not verified**.
- No real-time Vercel deploy state or Supabase DB state is claimed by this document.
- Next PR should contain genuine command/contract evidence and executable tests, not placeholder ledger implementations; merge and deploy require owner authorization.
