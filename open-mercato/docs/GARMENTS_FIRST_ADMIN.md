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

## Prerequisites

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
