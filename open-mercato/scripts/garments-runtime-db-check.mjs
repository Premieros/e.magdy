/** Read-only role/schema validation through the selected runtime pooler. */
import { configureGarmentsRuntimeDb } from './garments-runtime-db.mjs'
import { installGarmentsDbCa } from './garments-db-ca.mjs'
let client
try {
  if (!configureGarmentsRuntimeDb()) throw new Error('Explicit runtime mode required')
  installGarmentsDbCa()
  const { Client } = await import('pg')
  client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000, statement_timeout: 10000 })
  await client.connect()
  const c = (await client.query("select current_user as role,current_schema() as schema,current_setting('search_path') as path")).rows[0]
  if (c.role !== 'garments_ops_login' || c.schema !== 'garments_ops' || c.path !== 'garments_ops') {
    throw new Error('Runtime role/schema differs')
  }
  console.log('PASS: transaction pooler has the restricted garments_ops_login principal and exclusive garments_ops search_path')
} catch {
  console.error('Runtime transaction-pooler preflight failed; no schema changes were attempted')
  process.exitCode = 1
} finally {
  if (client) await client.end()
}
