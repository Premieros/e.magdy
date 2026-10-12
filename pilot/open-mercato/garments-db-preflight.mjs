// One-project / one-schema PostgreSQL preflight. Never writes, logs or exposes credentials.
import { Client } from 'pg'
import { assertRuntimeConfig } from './garments-target-policy.mjs'

export async function checkGarmentsConnection({ revealCounts = false } = {}) {
  const target = assertRuntimeConfig(process.env)
  const ssl = process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : undefined
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl,
    connectionTimeoutMillis: 8000,
    query_timeout: 10000,
    application_name: 'premieros-garments-preflight',
  })
  try {
    await client.connect()
    const result = await client.query(`
      SELECT current_database() AS db,
             current_user AS role,
             current_schema() AS schema,
             has_schema_privilege(current_user,'public','CREATE') AS may_create_public,
             (SELECT project_ref FROM garments_ops.project_binding WHERE singleton=true) AS project_ref,
             EXISTS(SELECT 1 FROM information_schema.tables
                    WHERE table_schema='garments_ops' AND table_name='users') AS has_users,
             EXISTS(SELECT 1 FROM information_schema.tables
                    WHERE table_schema='garments_ops' AND table_name='organizations') AS has_organizations
    `)
    const row = result.rows[0]
    if (!row || row.db !== 'postgres' || row.role !== 'garments_ops_login'
       || row.schema !== 'garments_ops' || row.may_create_public
       || row.project_ref !== target.projectRef) {
      throw Object.assign(new Error('Isolated schema verification refused'), { code:'GARMENTS_ISOLATION_FAILED' })
    }
    return {
      isolated: true,
      projectRef: target.projectRef,
      schema: target.schema,
      initialized: Boolean(row.has_users && row.has_organizations),
      ...(revealCounts ? { usersTable:row.has_users, organizationsTable:row.has_organizations } : {}),
    }
  } finally {
    await client.end().catch(() => {})
  }
}

if ((process.argv[1] || '').endsWith('garments-db-preflight.mjs')) {
  try {
    const checked = await checkGarmentsConnection({ revealCounts: true })
    console.log('[garments-db] Project and restricted schema verified:', checked.projectRef,
      checked.schema, 'initialized:', checked.initialized)
  } catch (error) {
    const code = String(error?.code || 'PRECHECK_FAILED').replace(/[^A-Z_0-9]/g,'').slice(0,40)
    console.error('[garments-db] Safe database preflight failed (code '+code+'). Verify restricted login, session pooler and schema.')
    process.exitCode=1
  }
}
