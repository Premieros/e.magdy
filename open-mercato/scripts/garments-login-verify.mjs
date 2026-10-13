/**
 * One-shot live sign-in verification. Never part of the normal build.
 * Password, cookies, JWT and database credentials are never logged or exported.
 */
import { assertRuntimeConfig } from './garments-target-policy.mjs'
import { installGarmentsDbCa } from './garments-db-ca.mjs'
import { installSecretOutputGuard } from './garments-secret-output-guard.mjs'
const origin = 'https://premieros-garments-mercato.vercel.app'
const email = 'sayed3la2@gmail.com'
function check(ok) { if (!ok) throw new Error('Verification failed') }
let client, cookie = ''
try {
  const e = process.env
  check(e.VERCEL === '1' && e.VERCEL_ENV === 'production' &&
    e.VERCEL_PROJECT_ID === 'prj_cJZuRsheb50NS5hpy1ePrnA83IBB' &&
    e.VERCEL_GIT_COMMIT_REF === 'deploy/garments-mercato' &&
    /^[a-f0-9]{40}$/.test(e.GARMENTS_VERIFY_COMMIT ?? '') &&
    e.VERCEL_GIT_COMMIT_SHA === e.GARMENTS_VERIFY_COMMIT)
  assertRuntimeConfig(e)
  check(e.MIKRO_ORM_SCHEMA === 'garments_ops' && e.TENANT_DATA_ENCRYPTION === 'true')
  check(typeof e.GARMENTS_SETUP_ADMIN_PASSWORD === 'string' && e.GARMENTS_SETUP_ADMIN_PASSWORD.length >= 16)
  installSecretOutputGuard(e.GARMENTS_SETUP_ADMIN_PASSWORD)
  installGarmentsDbCa()
  const { Client } = await import('pg')
  client = new Client({ connectionString: e.DATABASE_URL, ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000, statement_timeout: 10000 })
  await client.connect()
  const context = (await client.query("select current_user as role,current_schema() as schema,current_setting('search_path') as path")).rows[0]
  check(context.role === 'garments_ops_login' && context.schema === 'garments_ops' && context.path === 'garments_ops')
  const state = (await client.query(`select u.email,u.email_hash,u.tenant_id::text as tenant,u.organization_id::text as org,
    (select count(*) from garments_ops.users) as users,
    (select count(*) from garments_ops.tenants) as tenants,
    (select count(*) from garments_ops.organizations) as orgs,
    (select count(*) from garments_ops.roles) as roles,
    (select count(*) from garments_ops.role_acls) as acls
    from garments_ops.users u join garments_ops.organizations o on o.id=u.organization_id
    where o.slug='premieros-garments' and o.name='PremierOS Garments' and u.is_confirmed and u.deleted_at is null`)).rows
  check(state.length === 1)
  const s = state[0]
  check(+s.users === 1 && +s.tenants === 1 && +s.orgs === 1 && +s.roles === 3 && +s.acls >= 3)
  const history = (await client.query('select name from garments_ops.mikro_orm_migrations_api_keys order by id')).rows.map(x=>x.name.replace(/\.(js|ts)$/,''))
  check(JSON.stringify(history) === JSON.stringify(['Migration20251030150038','Migration20260116225251','Migration20260125204102','Migration20260523234901']))
  const { createKmsService } = await import('@open-mercato/shared/lib/encryption/kms')
  const { decryptWithAesGcm } = await import('@open-mercato/shared/lib/encryption/aes')
  const dek = await createKmsService().getTenantDek(s.tenant)
  check(dek && decryptWithAesGcm(s.email, dek.key) === email)
  console.log('PASS: restricted role, exact four migration records, preserved tenant/org/roles, encrypted owner email decrypts correctly')
  const form = new URLSearchParams({ email, password: e.GARMENTS_SETUP_ADMIN_PASSWORD, requireRole: 'superadmin', redirect: '/backend' })
  const response = await fetch(origin + '/api/auth/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin }, body: form,
    signal: AbortSignal.timeout(30000) })
  console.log('Live login HTTP status: ' + response.status)
  check(response.status === 200)
  const body = await response.json()
  check(body.ok === true && typeof body.token === 'string')
  const { verifyJwt } = await import('@open-mercato/shared/lib/auth/jwt')
  const claims = verifyJwt(body.token)
  check(claims && claims.email === email && claims.tenantId === s.tenant && claims.orgId === s.org &&
    Array.isArray(claims.roles) && claims.roles.includes('superadmin') && typeof claims.sid === 'string')
  cookie = response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ')
  check(cookie.includes('auth_token='))
  let backendUrl = origin + '/backend'
  let backend
  for (let i = 0; i < 4; i += 1) {
    backend = await fetch(backendUrl, { redirect: 'manual',
      headers: { cookie }, signal: AbortSignal.timeout(30000) })
    console.log('Authenticated backend HTTP status: ' + backend.status)
    if (![302,303,307,308].includes(backend.status)) break
    const location = backend.headers.get('location')
    check(location)
    const next = new URL(location, backendUrl)
    console.log('Authenticated redirect path: ' + next.pathname)
    check(next.origin === origin && next.pathname !== '/login' && next.pathname !== '/start')
    backendUrl = next.href
  }
  check(backend.status === 200)
  const logout = await fetch(origin + '/api/auth/logout', { method: 'POST', redirect: 'manual',
    headers: { cookie, origin }, signal: AbortSignal.timeout(30000) })
  check([200,302,303,307,308].includes(logout.status))
  const sessions = (await client.query('select count(*) as n from garments_ops.sessions where id=$1::uuid', [claims.sid])).rows[0]
  check(+sessions.n === 0)
  cookie = ''
  console.log('PASS: live superadmin login, signed tenant/org-scoped token, backend access and test-session logout verified')
} catch {
  console.error('Live administrator verification stopped; inspect the preceding safe status output')
  process.exitCode = 1
} finally {
  if (cookie) {
    try { await fetch(origin + '/api/auth/logout', { method: 'POST', redirect: 'manual',
      headers: { cookie, origin }, signal: AbortSignal.timeout(10000) }) } catch {}
  }
  if (client) await client.end()
}
