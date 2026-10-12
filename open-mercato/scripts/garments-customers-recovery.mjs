/**
 * ONE-OFF guarded recovery for Open Mercato 0.9.0
 * customers/Migration20260825140000_customers.ts.
 * Official WMS preset enables customers without communication_channels.
 * Upstream migration unconditionally backfills channel_id from missing tables.
 * Only safe while customer_interactions is empty.
 */
import { Client } from 'pg'
import { assertRuntimeConfig } from './garments-target-policy.mjs'
import { databaseCaFromEnv } from './garments-db-ca.mjs'

const target=assertRuntimeConfig(process.env)
if (process.env.MIKRO_ORM_SCHEMA!=='garments_ops'||process.env.DB_SSL!=='true'
  ||process.env.DB_SSL_REJECT_UNAUTHORIZED!=='true')
  throw Error('Isolated schema or verified TLS not configured')
const ca=databaseCaFromEnv()
const client=new Client({
  connectionString:process.env.DATABASE_URL,
  ssl:{rejectUnauthorized:true,...(ca?{ca}:{})},
  connectionTimeoutMillis:8000,
  query_timeout:30000,
  application_name:'premieros-garments-customer-empty-backfill'
})
try {
  await client.connect()
  await client.query('BEGIN')
  const statement=[
    'SELECT current_database() AS db,current_user AS db_role,current_schema() AS schema_name,',
    "has_schema_privilege(current_user,'public','CREATE') AS public_create_allowed,",
    '(SELECT project_ref FROM garments_ops.project_binding WHERE singleton) AS project_ref,',
    '(SELECT count(*) FROM garments_ops.customer_interactions) AS interactions,',
    "to_regclass('garments_ops.message_channel_links') IS NOT NULL AS message_links_present,",
    "to_regclass('garments_ops.external_conversations') IS NOT NULL AS external_conversations_present,",
    "EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='garments_ops'",
    "AND table_name='customer_interactions' AND column_name='channel_id') AS column_exists,",
    "EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='garments_ops'",
    "AND indexname='customer_interactions_email_channel_idx') AS index_exists,",
    "EXISTS(SELECT 1 FROM garments_ops.mikro_orm_migrations_customers",
    "WHERE name='Migration20260825140000_customers') AS migration_recorded"
  ].join(' ')
  const row=(await client.query(statement)).rows[0]
  if(!row||row.db!=='postgres'||row.db_role!=='garments_ops_login'
    ||row.schema_name!=='garments_ops'||row.project_ref!==target.projectRef
    ||row.public_create_allowed||row.message_links_present
    ||row.external_conversations_present||Number(row.interactions)!==0)
    throw Error('Unsafe customers migration state; manual review required')
  if(row.column_exists&&row.index_exists&&row.migration_recorded) {
    await client.query('COMMIT')
    console.log('[garments] Optional channel backfill previously completed.')
  } else {
    if(row.column_exists||row.index_exists||row.migration_recorded)
      throw Error('Partial customers migration; manual review required')
    await client.query('ALTER TABLE garments_ops.customer_interactions ADD COLUMN channel_id uuid NULL')
    await client.query("CREATE INDEX customer_interactions_email_channel_idx ON garments_ops.customer_interactions (channel_id, entity_id) WHERE interaction_type = 'email' AND channel_id IS NOT NULL AND deleted_at IS NULL")
    await client.query("INSERT INTO garments_ops.mikro_orm_migrations_customers(name,executed_at) VALUES('Migration20260825140000_customers',now())")
    await client.query('COMMIT')
    console.log('[garments] Empty WMS customer channel backfill safely skipped; migration recorded.')
  }
} catch(err) {
  await client.query('ROLLBACK').catch(()=>{})
  const code=String(err?.code||'CUSTOMERS_MIGRATION_REFUSED').replace(/[^A-Z0-9_]/gi,'').slice(0,44)
  console.error('[garments] Guarded customers migration failed: '+code)
  process.exitCode=1
} finally {
  await client.end().catch(()=>{})
}
