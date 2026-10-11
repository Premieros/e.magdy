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
mkdir -p garments-ops/THIRD_PARTY_NOTICES
cp "$ROOT/pilot/open-mercato/THIRD_PARTY_LICENSE.txt" garments-ops/THIRD_PARTY_NOTICES/Open-Mercato-MIT.txt
cp "$ROOT/pilot/open-mercato/ATTRIBUTION.md" garments-ops/THIRD_PARTY_NOTICES/ATTRIBUTION.md
echo 'Open Mercato 0.9.0 WMS scaffold generated. Not installed or deployed; no database touched.'
