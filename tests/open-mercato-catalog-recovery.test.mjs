import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('catalog recovery is restricted to the only approved DB role and schema', () => {
  const src=readFileSync(new URL('../pilot/open-mercato/garments-catalog-recovery.mjs',import.meta.url),'utf8')
  assert.match(src,/assertRuntimeConfig\(process\.env\)/)
  assert.match(src,/DB_SSL_REJECT_UNAUTHORIZED\s*!==\s*'true'/)
  assert.match(src,/row\.db_role!=='garments_ops_login'/)
  assert.match(src,/row\.active_schema!=='garments_ops'/)
  assert.match(src,/row\.can_create_public/)
  assert.match(src,/row\.project_ref!==target\.projectRef/)
  assert.match(src,/row\.products/)
})
test('catalog recovery migrates only own product index and single recorded module migration', () => {
  const src=readFileSync(new URL('../pilot/open-mercato/garments-catalog-recovery.mjs',import.meta.url),'utf8')
  assert.match(src,/CREATE INDEX "catalog_products_search_trgm_idx"/)
  assert.match(src,/ON "garments_ops"\."catalog_products"/)
  assert.match(src,/public\.gin_trgm_ops/)
  assert.match(src,/INSERT INTO garments_ops\.mikro_orm_migrations_catalog/)
  assert.match(src,/Migration20260914120100/)
  assert.match(src,/await client\.query\('ROLLBACK'\)/)
  assert.doesNotMatch(src,/DROP TABLE|TRUNCATE|ALTER ROLE|GRANT CREATE|CREATE TABLE|UPDATE public\./i)
})
test('future Open Mercato scaffolds preserve catalog recovery and strict project policy', () => {
 const bootstrap=readFileSync(new URL('../pilot/open-mercato/bootstrap.sh',import.meta.url),'utf8')
 assert.match(bootstrap,/garments-catalog-recovery\.mjs/)
 assert.match(bootstrap,/garments-target-policy\.mjs/)
})
