# GitHub Pages Preview Deployment

The `.github/workflows/pages.yml` workflow publishes a **static, browser-local preview** on every push to `main` once GitHub Pages is enabled for the repository.

It verifies syntax and automated unit tests, then uploads ONLY `index.html`, `styles.css`, `app.js`, and the two browser modules under `src/` to avoid exposing test fixtures and database migration sources.

The deployment action outputs the actual `page_url` in the GitHub Actions run. Do not invent a URL until GitHub confirms Pages is ready.

## First activation
- The workflow calls `actions/configure-pages@v5` with `enablement: true`.
- If GitHub rejects automatic enablement, a repository administrator should open **Settings → Pages → Build and deployment → Source: GitHub Actions**, then rerun the workflow on `main`.
- For debugging, open **Actions → Deploy Garments Preview to GitHub Pages**.
- The public preview has **no built-in user accounts**, and its operational records live in that browser's `localStorage` only. Anyone can load the demo interface, but cannot read another browser's local data.
- Supabase integration is limited to optional manually triggered cloud backup requiring an existing Supabase Auth account. The credential is not persisted; RLS protects `garment_cloud_snapshots`.
- Avoid entering real personal, confidential, customer, or financial data in this preview.

## Not yet production ERP
- No server-side transactional production orders or concurrent warehouse reservations.
- No users/roles for factory operations.
- No real-time sync or shared multi-user stock.
- This preview is distinct from the original PremierOS and its Supabase project.
