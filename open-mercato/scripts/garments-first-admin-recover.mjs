/**
 * Recover exactly one first administrator for the PRE-EXISTING PremierOS Garments
 * tenant, using official Open Mercato 0.9.0 commands only. No manual user inserts.
 *
 * This file is not executed by the normal build. Even explicit invocation is
 * inert without a separate, exact one-time Production approval. Run ONLY after
 * the official api_keys migrations have been verified in garments_ops.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertRuntimeConfig } from './garments-target-policy.mjs'
import { installGarmentsDbCa } from './garments-db-ca.mjs'

const expectedApproval = 'PREMIEROS_GARMENTS_RECOVER_ADMIN_090_2026_10'
const email = 'sayed3la2@gmail.com'
const schema = 'garments_ops'
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function check(condition, message) {
  if (!condition) throw new Error(message)
}
function validateContext() {
  if (!Object.hasOwn(process.env, 'GARMENTS_RECOVERY_BUILD_APPROVAL')) return false
  const e = process.env
  check(e.GARMENTS_RECOVERY_BUILD_APPROVAL === expectedApproval, 'Invalid admin recovery approval')
  check(e.VERCEL === '1' && e.VERCEL_ENV === 'production', 'Only approved Vercel Production builds may recover users')
  check(e.VERCEL_PROJECT_ID === 'prj_cJZuRsheb50NS5hpy1ePrnA83IBB', 'Wrong project')
  check(e.VERCEL_GIT_COMMIT_REF === 'deploy/garments-mercato', 'Wrong branch')
  check(e.MIKRO_ORM_SCHEMA === schema && e.GARMENTS_DB_SCHEMA === schema, 'Wrong schema')
  check((e.GARMENTS_SETUP_ADMIN_EMAIL ?? '').trim().toLowerCase() === email, 'Wrong administrator')
  const password = e.GARMENTS_SETUP_ADMIN_PASSWORD
  check(typeof password === 'string' && password.length >= 16, 'Strong private password required')
  assertRuntimeConfig(e)
  return true
}

async function main() {
  if (!validateContext()) return
  installGarmentsDbCa()
  const { Client } = await import('pg')
  const { emailHashLookupValues } = await import('@open-mercato/core/modules/auth/lib/emailHash')
  const { isTenantDataEncryptionEnabled } = await import('@open-mercato/shared/lib/encryption/toggles')
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
  })
  await client.connect()
  let locked = false
  try {
    const context = (await client.query(
      "SELECT current_user AS db_role, current_schema() AS schema_name, current_setting('search_path') AS search_path",
    )).rows[0]
    check(context?.db_role === 'garments_ops_login' && context.schema_name === schema &&
      context.search_path === schema, 'Requires the restricted garments_ops_login role with exclusive search_path')
    const lock = await client.query('SELECT pg_try_advisory_lock(875314, 171009) AS acquired')
    check(lock.rows[0]?.acquired === true, 'Another garments operation is active')
    locked = true

    // The initial bootstrap already created one tenant, one organization, and
    // exactly the three standard roles, but no user or role ACLs. Never recreate.
    const preflight = (await client.query([
      'SELECT',
      '(SELECT count(*) FROM garments_ops.tenants) AS tenants,',
      '(SELECT count(*) FROM garments_ops.organizations) AS organizations,',
      '(SELECT count(*) FROM garments_ops.users) AS users,',
      '(SELECT count(*) FROM garments_ops.user_roles) AS user_roles,',
      '(SELECT count(*) FROM garments_ops.roles) AS roles,',
      '(SELECT count(*) FROM garments_ops.role_acls) AS role_acls,',
      '(SELECT count(*) FROM garments_ops.api_keys) AS api_keys,',
      '(SELECT count(*) FROM garments_ops.mikro_orm_migrations_api_keys) AS api_keys_migrations,',
      '(SELECT count(*) FROM garments_ops.roles r',
      ' JOIN garments_ops.organizations o ON o.tenant_id=r.tenant_id',
      " WHERE o.slug='premieros-garments' AND o.deleted_at IS NULL",
      " AND r.name IN ('superadmin','admin','employee') AND r.deleted_at IS NULL) AS approved_roles,",
      'o.id::text AS org_id, t.id::text AS tenant_id',
      'FROM garments_ops.organizations o',
      'JOIN garments_ops.tenants t ON t.id=o.tenant_id',
      "WHERE o.slug='premieros-garments' AND o.name='PremierOS Garments'",
      'AND o.is_active AND t.is_active AND o.deleted_at IS NULL AND t.deleted_at IS NULL',
    ].join(' '))).rows
    check(preflight.length === 1, 'Approved existing organization was not found exactly once')
    const s = preflight[0]
    check(Number(s.tenants) === 1 && Number(s.organizations) === 1 && Number(s.roles) === 3 &&
      Number(s.approved_roles) === 3, 'Tenant, organization, or roles have changed')
    check(Number(s.users) === 0 && Number(s.user_roles) === 0 && Number(s.role_acls) === 0,
      'Refusing recovery after another bootstrap/user/ACL operation')
    check(Number(s.api_keys) === 0 && Number(s.api_keys_migrations) === 4,
      'Official api_keys migrations are incomplete or contain unexpected data')
    // Refuse to bootstrap before the enabled module is part of the app.
    const { readFileSync } = await import('node:fs')
    check(readFileSync(resolve(appDir, 'src/modules.ts'), 'utf8')
      .includes("{ id: 'api_keys', from: '@open-mercato/core' }"), 'api_keys module disabled')

    const password = process.env.GARMENTS_SETUP_ADMIN_PASSWORD
    const { getPasswordPolicy, validatePassword } = await import('@open-mercato/shared/lib/auth/passwordPolicy')
    check(validatePassword(password, getPasswordPolicy()).ok, 'Administrator password fails official policy')
    if (isTenantDataEncryptionEnabled()) {
      const { createKmsService } = await import('@open-mercato/shared/lib/encryption/kms')
      check(createKmsService().isHealthy(), 'Encryption KMS is not healthy')
    }

    function stage(name) {
      const result = spawnSync(
        process.execPath, [resolve(appDir, 'scripts/garments-auth-recover-child.mjs')],
        {
          cwd: appDir,
          env: {
            ...process.env,
            GARMENTS_RECOVERY_STAGE: name,
            GARMENTS_RECOVERY_TENANT_ID: String(s.tenant_id),
            GARMENTS_RECOVERY_ORGANIZATION_ID: String(s.org_id),
          },
          stdio: 'inherit',
          timeout: 150000,
        },
      )
      if (result.error) throw result.error
      check(result.status === 0, 'Official admin recovery command failed at ' + name)
    }

    // Add-user uses the official transactional staff/role command. Because it
    // does not encrypt the email itself, run the official encrypt-email pass
    // after creation when encryption is enabled. Both are schema-scoped.
    stage('add-user')
    if (isTenantDataEncryptionEnabled()) stage('encrypt-email')
    stage('sync-acls')

    const rows = (await client.query([
      'SELECT u.id::text AS user_id, u.email, u.email_hash, u.is_confirmed,',
      'u.tenant_id::text AS tenant_id, u.organization_id::text AS org_id,',
      '(SELECT count(*) FROM garments_ops.users) AS users,',
      '(SELECT count(*) FROM garments_ops.user_roles) AS user_roles,',
      '(SELECT count(*) FROM garments_ops.role_acls) AS role_acls,',
      '(SELECT count(*) FROM garments_ops.tenants) AS tenants,',
      '(SELECT count(*) FROM garments_ops.organizations) AS organizations,',
      '(SELECT count(*) FROM garments_ops.roles) AS roles,',
      '(SELECT count(*) FROM garments_ops.user_roles ur',
      ' JOIN garments_ops.roles r ON r.id=ur.role_id',
      " WHERE ur.user_id=u.id AND r.name='superadmin' AND r.tenant_id=u.tenant_id",
      ' AND ur.deleted_at IS NULL AND r.deleted_at IS NULL) AS superadmin_memberships',
      'FROM garments_ops.users u',
      'WHERE u.deleted_at IS NULL AND u.tenant_id=$1::uuid AND u.organization_id=$2::uuid',
    ].join(' '), [s.tenant_id, s.org_id])).rows
    check(rows.length === 1, 'Recovery created an unexpected number of users')
    const created = rows[0]
    check(Number(created.users) === 1 && Number(created.user_roles) === 1 &&
      Number(created.superadmin_memberships) === 1 && created.is_confirmed === true &&
      Number(created.tenants) === 1 && Number(created.organizations) === 1 &&
      Number(created.roles) === 3 && Number(created.role_acls) >= 3,
      'Post-recovery user, roles, or ACL verification failed')
    check(emailHashLookupValues(email).includes(created.email_hash),
      'Official deterministic administrator email hash differs')
    const segments = String(created.email).split(':')
    check(!isTenantDataEncryptionEnabled() || (segments.length === 4 && segments[3] === 'v1'),
      'Administrator email encryption verification failed')
    console.log('Existing PremierOS Garments superadmin recovered and verified; remove recovery approval and rotate the password after login')
  } finally {
    if (locked) {
      try { await client.query('SELECT pg_advisory_unlock(875314, 171009)') } catch {}
    }
    await client.end()
  }
}

main().catch((error) => {
  // No stack/argv dump, even if an upstream driver error includes credentials.
  const message = String(error instanceof Error ? error.message : error)
  console.error('Garments existing-admin recovery stopped: ' + message
    .replaceAll(process.env.DATABASE_URL ?? '__NO_DB_URL__', '[REDACTED_DB_URL]')
    .replaceAll(process.env.GARMENTS_SETUP_ADMIN_PASSWORD ?? '__NO_PASSWORD__', '[REDACTED]'))
  process.exitCode = 1
})
