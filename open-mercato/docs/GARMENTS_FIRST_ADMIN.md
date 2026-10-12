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

## Cloud-only alternative (no local computer required)

**Do not publish an unauthenticated first-admin web form.** The first account must
be created only by an operator who is already authorized for the Vercel project.
GitHub Codespaces runs a private cloud terminal in your GitHub account, so the
local Windows computer is **not** required. This still requires a browser
session when you are ready to choose your own password.

1. Open [the deployment branch](https://github.com/Premieros/e.magdy/tree/deploy/garments-mercato), select **Code → Codespaces → Create codespace on deploy/garments-mercato**. Confirm the selected branch before opening the terminal.
2. In the Codespaces **terminal** (not the chat), run:

```bash
cd open-mercato
nvm install 24
nvm use 24
corepack enable
yarn install --immutable
npm install --global vercel
vercel login
vercel link --yes --project premieros-garments-mercato --scope sayedalaa82285-7634
```

3. Pull only the approved project's production environment, run the official
   initializer with private password prompts, then remove the temporary local
   copy **even if the initializer fails**:

```bash
set -e
umask 077
trap 'unset NODE_OPTIONS DOTENV_CONFIG_PATH; rm -f .env.local' EXIT
vercel env pull .env.local --environment=production --yes
export DOTENV_CONFIG_PATH=.env.local
export NODE_OPTIONS="--require=dotenv/config"
yarn generate
yarn garments:bootstrap-admin
```

4. Confirm the bootstrap completed successfully, sign in at
   `https://premieros-garments-mercato.vercel.app/login?role=superadmin`,
   and **delete the Codespace** after closing its terminal to remove the
   temporary workspace. Codespaces requires the authenticated account to have
   access to this repo and the exact Vercel team/project; if authorization is
   missing, stop instead of using any other Supabase project.

Never send the password, `.env.local`, database URLs, or session credentials in
GitHub issues, commit messages, screenshots, support requests, or ChatGPT.
If you currently cannot use any browser or device, this step safely waits:
**do not create a default-password administrator instead.**

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
