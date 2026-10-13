# Garments client dictionary payload fix

The production login currently sends approximately 701 KB of uncompressed HTML, containing dictionaries for unrelated business modules. Backend renders serialize the complete dictionary both at the root and in the existing backend provider.

The root provider now selects only known public/shared UI keys on public and backend routes. The backend layout still supplies its complete dictionary to all backend screens. Unknown extension routes retain the entire dictionary; a missing or spoofed pathname cannot remove translations outside the known layouts. Existing proxy overwrites x-next-url from the actual request pathname.

Four focused tests verify login/reset keys, unknown-route fallback, backend root filtering and actual nested provider translation rendering. TypeScript and targeted ESLint passed. Login/auth requests, cookies, encryption, credentials, organization scope and database behavior are unchanged. No schema writes or migrations. No Johnas changes.

This is a payload reduction, not a claim that all database/server/network latency is fixed. Vercel runtime logs also showed events/stream hitting its 300-second maximum; the supported non-secret OM_EVENTS_SSE_CONNECTION_MAX_AGE_MS production setting is lowered to 240000 to rotate connections gracefully, retaining the canonical auth revalidation interval.

The broader POS/theme PR #27 remains separate and unpublished. This release contains only the dictionary fix.
