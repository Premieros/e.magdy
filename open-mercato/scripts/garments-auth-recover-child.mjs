/**
 * CLI subprocess for *existing* PremierOS Garments organization recovery.
 * Password is received ONLY through the private Production environment,
 * inserted into process.argv in memory (never OS argv), and redacted from logs.
 */
import { assertRuntimeConfig } from './garments-target-policy.mjs'
import { installSecretOutputGuard } from './garments-secret-output-guard.mjs'

const env = process.env
if (env.GARMENTS_RECOVERY_BUILD_APPROVAL !== 'PREMIEROS_GARMENTS_RECOVER_ADMIN_090_2026_10') {
  throw new Error('Recovery has no one-time Production approval')
}
if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production' ||
    env.VERCEL_PROJECT_ID !== 'prj_cJZuRsheb50NS5hpy1ePrnA83IBB' ||
    env.VERCEL_GIT_COMMIT_REF !== 'deploy/garments-mercato') {
  throw new Error('Refusing auth recovery outside the approved Production project and branch')
}
assertRuntimeConfig(env)
if (env.MIKRO_ORM_SCHEMA !== 'garments_ops') {
  throw new Error('Recovery requires garments_ops ORM schema')
}
const email = (env.GARMENTS_SETUP_ADMIN_EMAIL ?? '').trim().toLowerCase()
if (email !== 'sayed3la2@gmail.com') {
  throw new Error('Unexpected administrator email')
}
const password = env.GARMENTS_SETUP_ADMIN_PASSWORD
if (typeof password !== 'string' || password.length < 16) {
  throw new Error('Approved administrator password is unavailable')
}
installSecretOutputGuard(password)
const { getPasswordPolicy, validatePassword } = await import('@open-mercato/shared/lib/auth/passwordPolicy')
if (!validatePassword(password, getPasswordPolicy()).ok) {
  throw new Error('Administrator password fails the official password policy')
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tenantId = env.GARMENTS_RECOVERY_TENANT_ID
const organizationId = env.GARMENTS_RECOVERY_ORGANIZATION_ID
if (!uuidPattern.test(tenantId ?? '') || !uuidPattern.test(organizationId ?? '')) {
  throw new Error('Validated tenant and organization ids are required')
}
const stage = env.GARMENTS_RECOVERY_STAGE
const commands = {
  'add-user': ['auth', 'add-user', '--email', email, '--password', password,
    '--organizationId', organizationId, '--roles', 'superadmin'],
  'encrypt-email': ['auth', 'rotate-encryption-key', '--tenant', tenantId,
    '--organizationId', organizationId],
  'sync-acls': ['auth', 'sync-role-acls', '--tenant', tenantId],
}
if (!Object.hasOwn(commands, stage)) {
  throw new Error('Unsupported recovery stage')
}
env.OM_CLI_QUIET = '1'
process.argv = [process.execPath, process.argv[1], ...commands[stage]]
await import('./mercato-cli.mjs')
