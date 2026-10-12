import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as tls from 'node:tls'
import { X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { databaseCaFromEnv, parseGarmentsCaCertificates, installGarmentsDbCa } from '../pilot/open-mercato/garments-db-ca.mjs'
import { assertRuntimeConfig } from '../pilot/open-mercato/target-policy.mjs'

const referenceCertificate = tls.rootCertificates.find(value => {
  const cert = new X509Certificate(value)
  return cert.ca && Date.parse(cert.validFrom) <= Date.now() && Date.parse(cert.validTo) > Date.now()
})

test('trusted CA configuration accepts only valid certificate authorities', () => {
  assert.ok(referenceCertificate)
  const certs=parseGarmentsCaCertificates(referenceCertificate)
  assert.equal(certs.length, 1)
  assert.equal(databaseCaFromEnv({ GARMENTS_DB_CA_PEM: referenceCertificate }), referenceCertificate.trim())
  assert.equal(databaseCaFromEnv({}), undefined)
  assert.deepEqual(parseGarmentsCaCertificates(''), [])
})

test('rejects forged inputs and never disables certificate verification', () => {
  for (const source of ['not-a-certificate', '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----',
    referenceCertificate + '\nEXTRA TRAILING DATA', '-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----']) {
    assert.throws(() => parseGarmentsCaCertificates(source))
  }
  const source=readFileSync(new URL('../pilot/open-mercato/garments-db-preflight.mjs', import.meta.url),'utf8')
  assert.match(source, /rejectUnauthorized: true/)
  assert.match(source, /databaseCaFromEnv/)
  assert.doesNotMatch(source, /rejectUnauthorized: false/)
})

test('registers certified CA alongside existing trust roots',()=>{
  let received
  const fakeTls={getCACertificates:()=>['EXISTING'],setDefaultCACertificates:(certs)=>{received=certs}}
  assert.equal(installGarmentsDbCa({GARMENTS_DB_CA_PEM:referenceCertificate},fakeTls),true)
  assert.deepEqual(received,['EXISTING',referenceCertificate.trim()])
  assert.equal(installGarmentsDbCa({},fakeTls),false)
  assert.throws(()=>installGarmentsDbCa({GARMENTS_DB_CA_PEM:referenceCertificate},{getCACertificates:()=>[]}),
    /GARMENTS_CA_REQUIRES_NODE/)
})

test('scaffold installs CA into Next instrumentation and CLI, not browser source',()=>{
  const helper=readFileSync(new URL('../pilot/open-mercato/apply-db-ca.mjs',import.meta.url),'utf8')
  const bootstrap=readFileSync(new URL('../pilot/open-mercato/bootstrap.sh',import.meta.url),'utf8')
  assert.match(helper,/src\/instrumentation\.ts/)
  assert.match(helper,/mercato-cli\.mjs/)
  assert.match(helper,/installGarmentsDbCa/)
  assert.match(bootstrap,/garments-db-ca\.mjs/)
  assert.match(bootstrap,/apply-db-ca\.mjs/)
})

test('project policy refuses explicitly disabled TLS',()=>{
  const good={SUPABASE_PROJECT_REF:'yumeijsyiphzdsulsubf',GARMENTS_DB_SCHEMA:'garments_ops',MIKRO_ORM_SCHEMA:'garments_ops',
    DATABASE_URL:'postgresql://garments_ops_login:sample@db.yumeijsyiphzdsulsubf.supabase.co:5432/postgres?options=-c%20search_path%3Dgarments_ops'}
  assert.throws(()=>assertRuntimeConfig({...good, DB_SSL_REJECT_UNAUTHORIZED:'false'}),/certificate verification/)
  assert.throws(()=>assertRuntimeConfig({...good, DB_SSL:'false'}),/certificate verification/)
})
