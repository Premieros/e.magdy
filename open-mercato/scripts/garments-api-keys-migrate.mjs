/**
 * One-shot official api_keys migrations for PremierOS Garments (Open Mercato 0.9.0).
 * Inert without a separate, exact production build approval.
 * Deliberately does NOT run the general "mercato db migrate" command.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertRuntimeConfig } from './garments-target-policy.mjs'
import { installGarmentsDbCa } from './garments-db-ca.mjs'

const approvalKey = 'GARMENTS_API_KEYS_MIGRATION_APPROVAL'
const approval = 'PREMIEROS_GARMENTS_API_KEYS_090_2026_10'
const schema = 'garments_ops'
const expected = [
  'Migration20251030150038',
  'Migration20260116225251',
  'Migration20260125204102',
  'Migration20260523234901',
]
function check(ok, message) { if (!ok) throw new Error(message) }

function validateEnv() {
  if (!(approvalKey in process.env)) return false
  check(process.env[approvalKey] === approval, 'Invalid api_keys migration approval')
  check(process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production', 'Vercel Production build required')
  check(process.env.VERCEL_PROJECT_ID === 'prj_cJZuRsheb50NS5hpy1ePrnA83IBB', 'Wrong Vercel project')
  check(process.env.VERCEL_GIT_COMMIT_REF === 'deploy/garments-mercato', 'Wrong Git branch')
  check(process.env.MIKRO_ORM_SCHEMA === schema && process.env.GARMENTS_DB_SCHEMA === schema,
    'Refusing to access a different schema')
  assertRuntimeConfig(process.env)
  return true
}

async function main() {
  if (!validateEnv()) return
  installGarmentsDbCa()
  const { Client } = await import('pg')
  const { getSslConfig } = await import('@open-mercato/shared/lib/db/ssl')
  const ssl = getSslConfig()
  const connection = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl,
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
  })
  await connection.connect()
  let locked = false
  try {
    const context = await connection.query(
      "SELECT current_user AS db_role, current_schema() AS schema_name, current_setting('search_path') AS search_path"
    )
    check(context.rows[0]?.db_role === 'garments_ops_login', 'Restricted DB login required')
    check(context.rows[0]?.schema_name === schema && context.rows[0]?.search_path === schema,
      'Exclusive garments_ops search_path required')
    const lock = await connection.query('SELECT pg_try_advisory_lock(875314, 171009) AS ok')
    check(lock.rows[0]?.ok === true, 'A garments setup operation is already in progress')
    locked = true

    const before = await connection.query([
      'SELECT',
      '(SELECT count(*) FROM garments_ops.tenants) AS tenants,',
      '(SELECT count(*) FROM garments_ops.organizations) AS organizations,',
      "(SELECT count(*) FROM garments_ops.organizations o JOIN garments_ops.tenants t ON o.tenant_id=t.id",
      " WHERE o.slug='premieros-garments' AND o.name='PremierOS Garments'",
      ' AND o.is_active AND t.is_active) AS approved_org,',
      '(SELECT count(*) FROM garments_ops.roles) AS roles,',
      "(SELECT count(*) FROM garments_ops.roles WHERE name IN ('superadmin','admin','employee')) AS approved_roles,",
      '(SELECT count(*) FROM garments_ops.users) AS users,',
      '(SELECT count(*) FROM garments_ops.user_roles) AS user_roles,',
      "to_regclass('garments_ops.api_keys') AS keys_table,",
      "to_regclass('garments_ops.mikro_orm_migrations_api_keys') AS migration_table",
    ].join(' '))
    const s = before.rows[0]
    check(Number(s.tenants) === 1 && Number(s.organizations) === 1 && Number(s.approved_org) === 1,
      'Existing garments tenant/organization does not match the approved setup')
    check(Number(s.roles) === 3 && Number(s.approved_roles) === 3 && Number(s.users) === 0 &&
      Number(s.user_roles) === 0, 'User/role state changed; stop')
    check(s.keys_table === null && s.migration_table === null, 'api_keys migrations already started; stop')

    const appModules = readFileSync(resolve('src/modules.ts'), 'utf8')
    check(appModules.includes("{ id: 'api_keys', from: '@open-mercato/core' }"),
      'Official api_keys module is not enabled')
    const entityUrl = import.meta.resolve('@open-mercato/core/modules/api_keys/data/entities')
    const dataDir = dirname(fileURLToPath(entityUrl))
    const pkg = JSON.parse(readFileSync(resolve(dataDir, '../../../..', 'package.json'), 'utf8'))
    check(pkg.version === '0.9.0', 'Only Open Mercato core 0.9.0 migrations are approved')
    const migrationDir = resolve(dataDir, '../migrations')
    const files = readdirSync(migrationDir).filter((file) => /^Migration\d+\.js$/.test(file)).sort()
    check(JSON.stringify(files) === JSON.stringify(expected.map((name) => name + '.js')),
      'Unexpected upstream migration files; stop')

    const { MikroORM } = await import('@mikro-orm/core')
    const { pathToFileURL } = await import('node:url')
    const dynamicImportProvider = async (id) => {
      const specifier = id.startsWith('/') ? pathToFileURL(id).href : id
      return import(specifier)
    }
    const { PostgreSqlDriver } = await import('@mikro-orm/postgresql')
    const { ReflectMetadataProvider } = await import('@mikro-orm/decorators/legacy')
    await import('@mikro-orm/migrations')
    const orm = await MikroORM.init({
      driver: PostgreSqlDriver,
      clientUrl: process.env.DATABASE_URL,
      schema,
      entities: [],
      dynamicImportProvider,
      metadataProvider: ReflectMetadataProvider,
      discovery: { warnWhenNoEntities: false },
      migrations: {
        path: migrationDir,
        glob: '!(*.d).{ts,js}',
        tableName: 'mikro_orm_migrations_api_keys',
        snapshot: false,
        dropTables: false,
      },
      pool: { min: 1, max: 3, idleTimeoutMillis: 30000 },
      driverOptions: ssl ? { ssl } : undefined,
    })
    try {
      const migrator = orm.migrator
      const pending = await migrator.getPending()
      const names = pending.map((item) => typeof item === 'string'
        ? item : (item.name ?? item.fileName))
      const canonical = names.map((name) => String(name).replace(/\.(?:ts|js)$/, ''))
      check(JSON.stringify(canonical) === JSON.stringify(expected),
        'Migration plan differs from the four approved official migrations')
      for (let i = 0; i < names.length; i += 1) {
        await migrator.up({ migrations: [names[i]] })
        console.log('Official api_keys migration ' + (i + 1) + '/4 completed')
      }
    } finally {
      await orm.close(true)
    }

    const after = await connection.query([
      'SELECT',
      '(SELECT count(*) FROM garments_ops.mikro_orm_migrations_api_keys) AS migrations,',
      '(SELECT count(*) FROM garments_ops.api_keys) AS api_keys,',
      '(SELECT count(*) FROM garments_ops.users) AS users,',
      '(SELECT count(*) FROM garments_ops.user_roles) AS user_roles,',
      '(SELECT count(*) FROM garments_ops.tenants) AS tenants,',
      '(SELECT count(*) FROM garments_ops.organizations) AS organizations,',
      '(SELECT count(*) FROM garments_ops.roles) AS roles,',
      "(SELECT count(*) FROM information_schema.columns WHERE table_schema='garments_ops'",
      "AND table_name='api_keys' AND column_name IN ('session_token','session_user_id',",
      "'session_secret_encrypted','opencode_session_id')) AS extra_columns",
    ].join(' '))
    const a = after.rows[0]
    check(Number(a.migrations) === 4 && Number(a.extra_columns) === 4 && Number(a.api_keys) === 0,
      'Incomplete api_keys table or migration history')
    check(Number(a.tenants) === 1 && Number(a.organizations) === 1 && Number(a.roles) === 3 &&
      Number(a.users) === 0 && Number(a.user_roles) === 0, 'Existing data changed unexpectedly')
    console.log('Verified all four api_keys migrations within garments_ops; remove migration approval')
  } finally {
    if (locked) {
      try { await connection.query('SELECT pg_advisory_unlock(875314, 171009)') } catch {}
    }
    await connection.end()
  }
}

try { await main() } catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error('Garments api_keys-only migration stopped: ' + String(message)
    .replaceAll(process.env.DATABASE_URL ?? '__absent_url__', '[REDACTED_DB_URL]')
    .replaceAll(process.env.GARMENTS_SETUP_ADMIN_PASSWORD ?? '__absent_password__', '[REDACTED]'))
  process.exitCode = 1
}
