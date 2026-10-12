#!/usr/bin/env bash
# Standalone pilot scaffold. NEVER installs into the existing GitHub Pages app.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET="${1:-$ROOT/.mercato-pilot-build}"
if [[ -e "$TARGET" ]]; then
  echo "Refusing to overwrite existing path: $TARGET" >&2
  exit 2
fi
if [[ "$TARGET" == "$ROOT" || "$TARGET" == "$ROOT/" ]]; then
  echo 'Refusing to overwrite PremierOS Garments.' >&2
  exit 2
fi
if [[ "$(node -p 'parseInt(process.versions.node.split(".")[0],10)')" -lt 24 ]]; then
  echo 'Open Mercato requires Node.js 24 or later.' >&2
  exit 2
fi
mkdir -p "$TARGET"
cd "$TARGET"
# The upstream create-app CLI version is pinned, preset selected non-interactively.
# No database connection, no migrations, no cloud deployment, no Github credentials.
npx --yes create-mercato-app@0.9.0 garments-ops --preset wms --agents none --no-init-git
test -f garments-ops/package.json
test -f garments-ops/src/modules.ts
test -f garments-ops/.mercato/starter-preset.json
grep -q '"preset": "wms"' garments-ops/.mercato/starter-preset.json
for module in auth customers catalog sales wms audit_logs; do
  grep -q "id: '$module'" garments-ops/src/modules.ts || {
    echo "Expected Open Mercato module missing: $module" >&2; exit 1;
  }
done
if [[ -f garments-ops/.env || -f garments-ops/.env.local ]]; then
  echo 'Scaffold unexpectedly contained live .env credentials.' >&2
  exit 1
fi
# Keep the generated app on the ONE approved Supabase project; never use its local DB defaults.
cp "$ROOT/pilot/open-mercato/target-policy.mjs" garments-ops/scripts/garments-target-policy.mjs
node --input-type=module - "$TARGET/garments-ops" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const base=resolve(process.argv[2]);
const pkgFile=resolve(base,'package.json');
const p=JSON.parse(readFileSync(pkgFile,'utf8'));
const guard='node ./scripts/garments-target-policy.mjs && ';
for (const key of ['setup','setup:classic','dev','dev:classic','dev:verbose','start',
  'mercato','db:generate','db:migrate','db:greenfield','initialize','build']){
  if(p.scripts[key] && !p.scripts[key].startsWith(guard))p.scripts[key]=guard+p.scripts[key];
}
for (const key of ['setup:reinstall','setup:reinstall:classic','reinstall','dev:reset']){
  p.scripts[key]='node -e "console.error(\'Destructive reset disabled on shared Supabase project\');process.exit(2)"';
}
p.scripts['garments:db-check']='node ./scripts/garments-target-policy.mjs';
writeFileSync(pkgFile,JSON.stringify(p,null,2)+'\n');
const example=resolve(base,'.env.example');
const lines=readFileSync(example,'utf8').split('\n');
const header=[
  '# PremierOS Garments locked Supabase project. Replace PASSWORD only in private .env.',
  '# Never put actual credentials into Git or a browser bundle.',
  'SUPABASE_PROJECT_REF=yumeijsyiphzdsulsubf',
  'GARMENTS_DB_SCHEMA=garments_ops',
  '# DB role is NOLOGIN until deployment credentials are securely provisioned.',
  'DATABASE_URL=postgres://garments_ops_login:PASSWORD@db.yumeijsyiphzdsulsubf.supabase.co:5432/postgres?options=-c%20search_path%3Dgarments_ops',
  ''
];
const filtered=lines.filter(x=>!/^DATABASE_URL=/.test(x) && !/^SUPABASE_PROJECT_REF=/.test(x) && !/^GARMENTS_DB_SCHEMA=/.test(x));
writeFileSync(example,header.join('\n')+filtered.join('\n'));
JS
# Open Mercato defaults to .mercato/next, but the Vercel Next.js builder
# expects the conventional .next output. Keep local behavior untouched.
node --input-type=module - "$TARGET/garments-ops/next.config.ts" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const config=process.argv[2];
const original=readFileSync(config,'utf8');
const from="distDir: '.mercato/next',";
const to="distDir: process.env.VERCEL === '1' ? '.next' : '.mercato/next',";
if(original.split(from).length!==2)throw Error('Unexpected upstream next.config distDir: cannot patch safely');
writeFileSync(config,original.replace(from,to));
JS
mkdir -p garments-ops/THIRD_PARTY_NOTICES
cp "$ROOT/pilot/open-mercato/THIRD_PARTY_LICENSE.txt" garments-ops/THIRD_PARTY_NOTICES/Open-Mercato-MIT.txt
cp "$ROOT/pilot/open-mercato/ATTRIBUTION.md" garments-ops/THIRD_PARTY_NOTICES/ATTRIBUTION.md
echo 'Open Mercato 0.9.0 WMS scaffold generated. Not installed or deployed; no database touched.'
