# PremierOS Garments — first administrator (operator runbook)

**Approved email:** `sayed3la2@gmail.com`  
**Organization:** `PremierOS Garments`  
**Permitted Supabase project:** `yumeijsyiphzdsulsubf`  
**Permitted schema:** `garments_ops`  
**Git branch:** `deploy/garments-mercato`  
**Vercel project:** `premieros-garments-mercato`

## Safety properties

- This runbook creates the *first* Open Mercato tenant, organization, and user through the **version-pinned** upstream `mercato auth setup` implementation, not through raw SQL.
- No other Supabase project or AMMCO table is ever targeted. The app's restricted `garments_ops_login` and exclusive schema search path are required.
- The bootstrap refuses non-empty `garments_ops.tenants`, `organizations`, `users`, or `roles`.
- It acquires a PostgreSQL advisory lock during execution to prevent concurrent runs of this bootstrap tool.
- Passwords are prompted with hidden input on the operator's own terminal; nothing is posted to GitHub, sent in a chat, saved as a Vercel runtime secret, or passed on the parent shell command line.
- Normal upstream password-policy checks remain enabled; no demo accounts, seed examples, schema reset, or migrations.
- The initial user receives the `superadmin` role. The `admin` and `employee` roles are also created, but demo users are **not** created. Do not confuse available roles with user-role assignments.

## One-time Vercel production-build bootstrap (operator-approved)

**Prefer this path when Codespaces is linked but Production Secrets cannot be
exported.** It does not open any signup URL, copy the database password into
Codespaces, or alter AMMCO. The guarded build hook is otherwise a no-op.

1. First ensure the safe build hook from branch
   \`ops/garments-first-admin-vercel-build\` has been reviewed and deployed
   to the approved \`deploy/garments-mercato\` branch with
   \`GARMENTS_BOOTSTRAP_BUILD_APPROVAL\` **absent**.
2. In your already-linked Codespace terminal (directory \`open-mercato\`),
   run \`vercel project inspect --non-interactive\`. Confirm the existing
   project, owner and scope exactly.
3. Choose a **new temporary** high-entropy password (at least 16 characters),
   not used for any other account. Enter it privately into the Vercel
   Production **Secret** prompt via:

   \`\`\`bash
   vercel env add GARMENTS_SETUP_ADMIN_PASSWORD production --type secret
   \`\`\`

   Never enter it in chat, GitHub code, screenshots or CLI command arguments.
   This temporary secret is for first-account initialization only, **not**
   a recommended long-term stored admin password.
4. Once the operator confirms that the Production Secret exists (name and
   type ONLY), set \`GARMENTS_BOOTSTRAP_BUILD_APPROVAL\` to
   \`PREMIEROS_GARMENTS_INITIAL_ADMIN_2026_10\` **for Production only** and
   trigger a *new Production build of the approved exact Git branch*.
   Do not run a preview deployment, \`setup:reinstall\`, \`db:migrate\`,
   \`db:greenfield\`, \`init\`, or sample seeding.
5. A production build invokes the existing guarded
   \`scripts/garments-first-admin.mjs\` after \`yarn generate\` and before
   Next.js compilation. It requires the exact Supabase ref/schema,
   target branch and approved admin email; refuses existing tenants,
   users, organizations or roles; takes an advisory lock; runs official
   Open Mercato \`auth setup\`; and verifies the \`superadmin\` assignment.
   A failed gate makes the deployment fail **closed**; do not rerun blindly
   after any partial failure.
6. Verify the database records: one tenant, one organization, one user,
   the approved email and \`superadmin\` membership. Then **immediately**
   remove BOTH one-time Production environment variables using Vercel's
   Dashboard, or (from the linked Codespace):

   \`\`\`bash
   vercel env rm GARMENTS_BOOTSTRAP_BUILD_APPROVAL production
   vercel env rm GARMENTS_SETUP_ADMIN_PASSWORD production
   \`\`\`

   Redeploy the ordinary production build **with neither variable present**,
   and confirm \`READY\`. Older deployment snapshots may retain secret
   references; after first sign-in, **change the temporary admin password
   to a different new, strong permanent one** in the application's approved
   password-change workflow. Sign out and verify login with the new password.
7. Delete the Codespace and any temporary workspace after completion. The
   production database credentials were never exported to it.

The administrator's first sign-in is at
\`https://premieros-garments-mercato.vercel.app/login?role=superadmin\`.
If password change, production build, or verified user assignment fails,
do not claim the account is ready for live operation.

## Cloud-only alternative (no local computer required)

The project owner can use **GitHub Codespaces** to authenticate to the
approved Vercel project, without a local computer. Authentication alone
does **not** grant access to the database connection string.

### Step 1 — Link the existing project

Open the `deploy/garments-mercato` branch in a private GitHub Codespace,
then in its terminal run:

```bash
cd open-mercato
nvm install 24
nvm use 24
corepack enable
npm install --global vercel
vercel login
vercel link --yes --project premieros-garments-mercato --scope sayedalaa82285-7634
vercel project inspect --non-interactive
```

Inspect that the linked Vercel project is **premieros-garments-mercato**,
not a new project. Complete device verification within Vercel/GitHub;
do not disclose login tokens or verification codes.

### Step 2 — Secure execution gate (NOT YET ENABLED)

**Important correction:** Vercel Production `Secret` / legacy
`Sensitive` environment variables **cannot be read back** by
`vercel env pull --environment=production`. In this deployment,
`DATABASE_URL`, `AUTH_SECRET`, `JWT_SECRET` and
`GARMENTS_DB_CA_PEM` are protected secrets. Consequently, the old
Codespaces instructions that blindly pull `.env.local` and immediately
run `yarn garments:bootstrap-admin` are not a working or approved path.
**Do not run setup on missing or fabricated connection credentials.**

A secure one-time execution path must first be configured, with the
official Open Mercato `auth setup` routine running **inside the
authorized Vercel execution environment**, or via an operator-managed
trusted secret manager that can legitimately provide the production
credentials without ChatGPT. It must require proof of control over the
Vercel project and private password entry, be one-use, and be disabled
after verification. No public or default-password bootstrap form is
permitted.

The approved new administrator remains `sayed3la2@gmail.com`;
tenant/organization and user currently remain uninitialized. Do not
copy project secrets into a chat, GitHub commit, issue, or screenshot.

## Prerequisites

**The following local-operator recipe requires independently authorized access to the protected production secrets; linking Vercel and pulling its production environment is not sufficient by itself.** Stop at this gate if protected values are missing. Do not invent or rotate credentials.

Operator needs: Windows PowerShell, Node.js >=24, Corepack/Yarn 4, Git, Vercel CLI logged in as an authorized member of project `premieros-garments-mercato`. Work from a **fresh clone**, so there is no unrelated `.env.local` to overwrite.

Use PowerShell:

```powershell
git clone --single-branch --branch deploy/garments-mercato https://github.com/Premieros/e.magdy.git
Set-Location .\e.magdy\open-mercato
corepack enable
yarn install --immutable

# Authentication happens directly with Vercel; do not copy passwords to chat.
vercel login
vercel link --yes --project premieros-garments-mercato --scope sayedalaa82285-7634
vercel env pull .env.local --environment=production --yes

# These env vars are temporary for this terminal only.
$env:DOTENV_CONFIG_PATH = ".env.local"
$env:NODE_OPTIONS = "--require=dotenv/config"
try {
  # The guard checks the exact Supabase ref and exclusive garments_ops schema.
  yarn generate
  yarn garments:bootstrap-admin
} finally {
  Remove-Item Env:DOTENV_CONFIG_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
  Remove-Item .env.local -Force -ErrorAction SilentlyContinue
}
```

When prompted, enter a **new unique password** twice. It will not echo. The length minimum is 16 characters and the upstream password policy must also pass. Do not use `secret` or enable `--include-demo-users`.

`vercel env pull` saves database credentials temporarily in the ignored `.env.local` file. Keep the workstation trusted and delete the file as shown. Never upload the file or include its contents in a support ticket.

## Verification

After successful initialization, the application `/start` should display 1 tenant, 1 organization and 1 user. Sign in at:

`https://premieros-garments-mercato.vercel.app/login?role=superadmin`

Then check authorized role and navigation. If the command fails, **do not rerun blindly**: examine the error first and inspect only the `garments_ops` tenant, organization, user and role tables. The bootstrap deliberately refuses a partially initialized installation to prevent double provision.

No schema migration or Supabase Auth signup is part of this runbook.
