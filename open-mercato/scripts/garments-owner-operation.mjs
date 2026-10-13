/**
 * Explicit one-off existing-tenant operation; never invoked by normal builds.
 * Secrets stay in the private Vercel environment. No auth setup/general migration.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertRuntimeConfig } from './garments-target-policy.mjs'
import { installSecretOutputGuard } from './garments-secret-output-guard.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function check(ok, message) { if (!ok) throw new Error(message) }

try {
  const env = process.env
  check(env.VERCEL === '1' && env.VERCEL_ENV === 'production', 'Real Vercel Production environment required')
  check(env.VERCEL_PROJECT_ID === 'prj_cJZuRsheb50NS5hpy1ePrnA83IBB', 'Wrong project')
  check(env.VERCEL_GIT_COMMIT_REF === 'deploy/garments-mercato', 'Wrong branch')
  check(/^[a-f0-9]{40}$/.test(env.GARMENTS_OPERATOR_COMMIT ?? '') &&
    env.VERCEL_GIT_COMMIT_SHA === env.GARMENTS_OPERATOR_COMMIT, 'Reviewed commit must match the real build commit')
  check(!env.GARMENTS_BOOTSTRAP_BUILD_APPROVAL, 'Initial auth setup is prohibited')
  check(env.MIKRO_ORM_SCHEMA === 'garments_ops', 'Wrong ORM schema')
  assertRuntimeConfig(env)
  check(env.TENANT_DATA_ENCRYPTION === 'true', 'Encryption must remain explicitly enabled')
  check(typeof env.TENANT_DATA_ENCRYPTION_FALLBACK_KEY === 'string' &&
    env.TENANT_DATA_ENCRYPTION_FALLBACK_KEY.length >= 64, 'Permanent official KMS secret required')
  check(typeof env.GARMENTS_SETUP_ADMIN_PASSWORD === 'string' &&
    env.GARMENTS_SETUP_ADMIN_PASSWORD.length >= 16, 'Private administrator password required')
  installSecretOutputGuard(env.GARMENTS_SETUP_ADMIN_PASSWORD)
  installSecretOutputGuard(env.TENANT_DATA_ENCRYPTION_FALLBACK_KEY)
  installSecretOutputGuard(env.DATABASE_URL)
  const stage = env.GARMENTS_OPERATOR_STAGE ?? 'all'
  check(stage === 'all' || stage === 'recover', 'Unsupported existing-tenant operation')
  function run(command, args, extra = {}, timeout = 180000) {
    const result = spawnSync(command, args, {
      cwd: appDir, env: { ...env, ...extra }, stdio: 'inherit', timeout,
    })
    if (result.error) throw new Error('Operator child process could not complete')
    check(result.status === 0, 'Operator step failed; inspect the scoped result before resuming')
  }
  run('corepack', ['yarn', 'generate'])
  if (stage === 'all') {
    run(process.execPath, [resolve(appDir, 'scripts/garments-api-keys-migrate.mjs')],
      { GARMENTS_API_KEYS_MIGRATION_APPROVAL: 'PREMIEROS_GARMENTS_API_KEYS_090_2026_10' })
  }
  run(process.execPath, [resolve(appDir, 'scripts/garments-first-admin-recover.mjs')],
    { GARMENTS_RECOVERY_BUILD_APPROVAL: 'PREMIEROS_GARMENTS_RECOVER_ADMIN_090_2026_10' })
  console.log('Verified scoped migrations and encrypted existing-tenant administrator')
  run(process.execPath, [resolve(appDir, 'node_modules/next/dist/bin/next'), 'build'],
    { NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=8192' }, 900000)
} catch {
  console.error('Existing-tenant operator stopped safely; review the preceding redacted step result')
  process.exitCode = 1
}
