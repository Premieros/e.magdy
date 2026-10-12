import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('diagnostics accept ONLY the locked yume project and the restricted schema', () => {
  const source=readFileSync(new URL('../pilot/open-mercato/garments-db-preflight.mjs',import.meta.url),'utf8')
  assert.match(source,/assertRuntimeConfig\(process\.env\)/)
  assert.match(source,/current_schema\(\)/)
  assert.match(source,/row\.role !== 'garments_ops_login'/)
  assert.match(source,/row\.schema !== 'garments_ops'/)
  assert.match(source,/row\.may_create_public/)
  assert.match(source,/row\.project_ref !== target\.projectRef/)
  assert.doesNotMatch(source,/DROP TABLE|TRUNCATE|UPDATE public\./)
})
test('public health route reports only safe status codes, never credentials or SQL text', () => {
  const source=readFileSync(new URL('../pilot/open-mercato/garments-health-route.js',import.meta.url),'utf8')
  assert.match(source,/NextResponse\.json/)
  assert.match(source,/initialization_required/)
  assert.match(source,/database_check_failed/)
  assert.match(source,/no-store/)
  assert.doesNotMatch(source,/process\.env|DATABASE_URL|password|error\.message|e\.message/)
})
test('WMS scaffold copies diagnostic source without replacing the current Pages website',()=>{
  const script=readFileSync(new URL('../pilot/open-mercato/bootstrap.sh',import.meta.url),'utf8')
  assert.match(script,/garments-db-preflight\.mjs/)
  assert.match(script,/garments-health\/route\.js/)
  assert.doesNotMatch(script,/drop table|delete from public\.|truncate table/i)
})
