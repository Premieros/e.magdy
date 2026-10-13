# Verified native POS integration surface (0.9.0 app source)

Inspection date: 2026-10-13. This records inspected source contracts, not proof of a completed financial workflow.

| Concern | Existing adapter | Evidence and boundary |
| --- | --- | --- |
| Authenticated tenant and single organization | `src/modules/premier_pos/lib/serverScope.ts` | `getAuthFromRequest`, `resolveOrganizationScopeForRequest`, `resolveSingleOrganizationIdOrDeny`; denies unauthenticated / unresolved organization |
| Scoped cart preview | `api/preview/route.ts` | `sales.orders.manage` + `catalog.products.view`, `SalesChannel` active and scoped by tenant/org, delegates tax/discount to `salesCalculationService` |
| Payment method labels | `api/payment-methods/route.ts` | `sales.payments.manage`; reads scoped, active manual `SalesPaymentMethod` labels only |
| Save order | `lib/checkout.ts` | Uses `sales/orders` official CRUD; reconciliation by order number/external reference and scope |
| Invoice | `lib/checkout.ts` | Uses `sales/invoices`, lines from persisted `sales/order-lines` and saved order totals |
| Payment | `lib/checkout.ts` | Uses `sales/payments`, payment reference and saved allocation; ambiguous responses cannot blindly auto-retry |
| Negative regression | `lib/__tests__/checkout.test.ts`, `api/__tests__/routes.test.ts` | Tests duplicate submit, lost responses, scope, amount preservation; in-memory transport or mocked requests, not production financial tests |

## Implications
- No new order, invoice, payment or stock ledgers will be introduced for restaurant or garment workflows.
- Checkout creation in `sales` is NOT evidence of WMS decrement or final settlement/GL postings. Verify these independently through official state and command APIs in approved isolation.
- A UI-only duplicate-submit guard is not a substitute for server-side cross-process idempotency/transaction locks.
- Existing POS unit tests are now included in the scoped PR CI; their latest run must pass before promotion.
- Actual organization profile persistence and ACL integration still require confirmation against installed configs and feature-toggles API.
- No schemas, production data, printing services or other projects changed.
