# PremierOS appearance, performance and general POS

Owner request (2026-10-13): copy Johnas fonts/colors and PremierOS logo, keep the Mercato foundation, support light/dark, improve slowness, and reproduce the Johnas selling workspace for multiple industries.

## Baseline and boundaries

Open Mercato 0.9.0; existing Garments project and only garments_ops. Johnas is a read-only visual reference. No new database, credentials, migrations, ledger, direct stock SQL, auth setup, or framework forks. Existing protected APIs/commands own products, prices, orders, invoices, payments and warehouse effects.

## Appearance and performance

Map Johnas color tokens to existing Mercato roles, self-host Cairo with its OFL license, use the PremierOS icon through the app-owned fallback asset and brand labels. Expose light/dark/system controls using the existing theme provider and storage. Preserve layouts and established theme initialization. Public known routes receive only the required translation keys; backend layouts continue to receive their full dictionary, including navigation from login.

Measured before changes: login HTML about 702 KB English / 724 KB Arabic; about 3,023 customers-key occurrences; TTFB about 6 seconds from this test runner. Separate payload improvements from server/network latency: never claim all latency eliminated from payload size alone.

## POS workspace

App-owned premier_pos module: Johnas-style category/product browser and search, current cart, SKU/variant choices, quantity and discount, customer/channel/currency selection, held drafts, official price/tax/discount preview, checkout and receipt. General products/services and optional variants; no garment-only assumptions. No fake kitchen, shift, offline settlement or hardware printing buttons when the installed platform has no equivalent configured service.

Protected stateless preview delegates financial math to salesCalculationService with server-resolved tenant and selected organization. Checkout uses official create APIs with one order payload containing all lines. Require a configured sales channel and currency. Preserve configured workflow states and numbering. Retain created document IDs through subsequent invoice/payment steps; never silently retry ambiguous money mutations. Success and receipt are derived from saved server documents, with unresolved steps exposed and links to their native management screens.

## Acceptance and validation

Light/dark/system preserve preference and Arabic RTL. PremierOS logo and Cairo load locally. Public dictionaries contain every key used by pinned login/reset/start pages; protected/unknown routes retain full dictionaries. POS access requires native sales/catalog permissions, queries and caches include user/tenant/org, and changing scope cannot reuse an active cart or old prices. Pagination/debounced cancellable search avoid full-table downloads. Totals come from the installed calculation service. Empty config/data, load failures, conflicts and uncertain checkout show recoverable states without duplicate payments. Verify auth/scope rejection, taxes/discounts, zero/missing price, concurrent clicks, order creation followed by checkout failure, and same-reference recovery. Live operation testing must not create/delete production fixtures or reset credentials.

## Implementation checks (2026-10-13)

20 unit/route contract tests passed, including installed sales engine VAT/discount math, no-auth and organization-change rejection, atomic native order payload, concurrent submissions, lost responses, persisted invoice amounts and no second uncertain capture. TypeScript and targeted ESLint passed. Arabic dictionary check passed with 2,630 reviewed entries. Public Arabic dictionary: 660,603 bytes / 10,017 keys down to 13,461 bytes / 218 keys before framework serialization. These are payload measurements, not a guarantee of end-to-end latency.

Held drafts retain channel/currency/customer context and stay in current-tab memory. Uncertain payment references cannot be cleared by starting another order. Browser printing uses native saved documents. No production sale fixtures were created. No kitchen, shifts, offline payments, hardware printing, or automatic warehouse fulfillment are implemented.

Johnas files, environments, deployments, database, and printing integration were never written. It remains a read-only reference. The published base performance fix (PR #28) was verified through secure admin sign-in, dashboard and product-list navigation. New POS UI verification remains pending deployment; live financial posting is not exercised because there are no catalog products or configured sale fixtures. Credentials will not be requested in chat or reset for testing.
