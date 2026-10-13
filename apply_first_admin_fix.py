#!/usr/bin/env python3
"""Apply the reviewed bootstrap CLI lifecycle fix to the dedicated FIX branch only.
Does not touch the database, Vercel, credentials, or production branch.
"""
from pathlib import Path
import subprocess
import sys

BRANCH = 'fix/garments-first-admin-cli-lifecycle-20261013'
ROOT = Path(subprocess.check_output(['git','rev-parse','--show-toplevel'], text=True).strip())
current = subprocess.check_output(['git','branch','--show-current'], text=True).strip()
if current != BRANCH:
    sys.exit('STOP: switch to the dedicated fix branch first; current branch is '+current)
p = ROOT / 'open-mercato/scripts/garments-first-admin.mjs'
if not p.is_file():
    sys.exit('STOP: target file absent')
s = p.read_text(encoding='utf-8')
start_anchor = '    // Run the version-pinned upstream CLI inside this same Node process.'
end_anchor = '    // Open Mercato 0.9.0 encrypts auth:user.email at rest.'
if s.count(start_anchor) != 1 or s.count(end_anchor) != 1:
    sys.exit('STOP: original code does not match expected version; no changes made')
a,b = s.index(start_anchor),s.index(end_anchor)
if a >= b or 'await import(\'./mercato-cli.mjs\')' not in s[a:b]:
    sys.exit('STOP: CLI import block does not match; no changes made')
replacement = '''    // Never import the Open Mercato CLI into this process: its bin launches
    // main() asynchronously and reads process.argv AFTER the import resolves.
    // Instead, wait for a dedicated CLI process to finish before verifying.
    // The password is inherited only through a private environment variable,
    // not sent as an OS process argument or emitted in build logs.
    const { spawnSync } = await import('node:child_process')
    const cliChildFile = resolve(dirname(fileURLToPath(import.meta.url)), 'garments-auth-setup-child.mjs')
    console.log('Starting official Open Mercato first-tenant setup in garments_ops.')
    const setup = spawnSync(process.execPath, [cliChildFile], {
      cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
      env: { ...process.env, GARMENTS_SETUP_ADMIN_PASSWORD: password },
      stdio: 'inherit',
      timeout: 150_000,
    })
    if (setup.error) throw setup.error
    if (setup.status !== 0) {
      throw new Error('Open Mercato auth setup did not complete successfully; inspect garments_ops before retrying')
    }
    // Verify only after the official CLI has exited successfully.
'''
p.write_text(s[:a]+replacement+s[b:], encoding='utf-8')
print('Patch prepared on FIX branch only:', p.relative_to(ROOT))
print('Next: node --check open-mercato/scripts/garments-first-admin.mjs')
