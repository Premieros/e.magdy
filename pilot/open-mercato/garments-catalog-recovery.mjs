/**
 * One-off Open Mercato 0.9.0 catalog migration recovery.
 * The official catalog migration creates a function in public; the owner
 * preinstalled that exact function using the trusted Supabase administrator.
 * This restricted app login may index its own EMPTY products table and record
 * this one migration, without CREATE on public.
 */
import { Client } from 'pg'
import { assertRuntimeConfig } from './garments-target-policy.mjs'
import { databaseCaFromEnv } from './garments-db-ca.mjs'

const target=assertRuntimeConfig(process.env)
if(process.env.DB_SSL!=='true'||process.env.DB_SSL_REJECT_UNAUTHORIZED!=='true')
  throw Error('Catalog recovery requires strict SSL certificate validation')
const ca=databaseCaFromEnv()
const client=new Client({
  connectionString:process.env.DATABASE_URL,
  ssl:{rejectUnauthorized:true,...(ca?{ca}:{})},
  connectionTimeoutMillis:8000,
  query_timeout:120000,
  application_name:'premieros-garments-one-off-catalog-index'
})
const columns=['title','subtitle','description','sku','handle']
const expr='public.om_immutable_unaccent('
  +columns.map(c=>'coalesce("'+c+'", '+ "''" +')').join(" || ' ' || ")+')'
try {
  await client.connect()
  await client.query('BEGIN')
  await client.query("SET LOCAL statement_timeout TO '120s'")
  const query=[
    'SELECT current_database() AS db, current_user AS db_role, current_schema() AS active_schema,',
    "has_schema_privilege(current_user,'public','CREATE') can_create_public,",
    '(SELECT project_ref FROM garments_ops.project_binding WHERE singleton) project_ref,',
    "to_regprocedure('public.om_immutable_unaccent(text)') IS NOT NULL has_function,",
    '(SELECT count(*) FROM garments_ops.catalog_products) products,',
    "EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='garments_ops'",
    "AND indexname='catalog_products_search_trgm_idx') has_index,",
    'EXISTS(SELECT 1 FROM garments_ops.mikro_orm_migrations_catalog',
    "WHERE name='Migration20260914120100') migration_recorded"
  ].join(' ')
  const row=(await client.query(query)).rows[0]
  if(row.db!=='postgres'||row.db_role!=='garments_ops_login'
    ||row.active_schema!=='garments_ops'||row.project_ref!==target.projectRef
    ||row.can_create_public||!row.has_function)throw Error('Recovery target not isolated or public function missing')
  if(row.has_index&&row.migration_recorded){
    await client.query('COMMIT')
    console.log('[garments] Catalog migration already recorded and index present.')
  } else {
    if(row.has_index||row.migration_recorded||Number(row.products)!==0)
      throw Error('Catalog migration state not clean; manual review required')
    await client.query('CREATE INDEX "catalog_products_search_trgm_idx" ON "garments_ops"."catalog_products" USING GIN ('+expr+' public.gin_trgm_ops)')
    await client.query("INSERT INTO garments_ops.mikro_orm_migrations_catalog(name,executed_at) VALUES('Migration20260914120100',now())")
    await client.query('COMMIT')
    console.log('[garments] Catalog-only GIN index created and migration recorded inside garments_ops.')
  }
} catch (err) {
  await client.query('ROLLBACK').catch(()=>{})
  const code=String(err?.code||'CATALOG_MIGRATION_REFUSED').replace(/[^A-Z0-9_]/gi,'').slice(0,40)
  console.error('[garments] Catalog-only migration refused ('+code+'); no public CREATE granted.')
  process.exitCode=1
} finally {
  await client.end().catch(()=>{})
}
