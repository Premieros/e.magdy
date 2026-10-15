import { describe, expect, it } from '@jest/globals'
import {
  buildSageIdentityAudit, parseSageIdentityCsv, parseSageIdentityJson,
  SAGE_IDENTITY_EXPORT_SQL,
} from '../sage-identity-readiness'

const a = '11111111-1111-4111-8111-111111111111'
const b = '22222222-2222-4222-8222-222222222222'
const p = (n: number) => '33333333-3333-4333-8333-' + String(n).padStart(12, '0')
const row = (i: number, branch_id = a) => ({
  id: p(i), name: 'Sage product ' + i,
  sku: null as string | null, branch_id,
  product_type: i <= 2 ? 'ready' : 'manufactured',
  is_active: i > 10,
})

describe('Sage-first ID-preserving readiness audit', () => {
  it('creates SQL that selects only permitted identity and status fields', () => {
    expect(SAGE_IDENTITY_EXPORT_SQL).toMatch(/^SELECT id::text AS id, name/)
    expect(SAGE_IDENTITY_EXPORT_SQL).toContain('branch_id::text AS branch_id')
    expect(SAGE_IDENTITY_EXPORT_SQL).toContain('FROM public.products')
    expect(SAGE_IDENTITY_EXPORT_SQL).not.toMatch(/INSERT|UPDATE|DELETE|DROP|ALTER|cost_price|sale_price|service_role/i)
  })
  it('supports the actual Sage situation: 513 products, 511 manufactured, no SKUs', () => {
    const input = Array.from({ length: 513 }, (_, i) => row(i + 1, i < 300 ? a : b))
    const validated = parseSageIdentityJson({ products: input })
    const report = buildSageIdentityAudit(validated)
    expect(report).toMatchObject({
      schemaVersion: 'premieros.sage.identity-readiness.v1',
      readOnly: true, canImport: false,
      total: 513, manufactured: 511, ready: 2, missingSku: 513,
      inactive: 10, unknownActivity: 0,
    })
    expect(report.branches).toHaveLength(2)
    expect(report.branches.map(v => v.total).sort()).toEqual([213, 300])
    expect(report.warnings.join(' ')).toMatch(/not a proof/)
    expect(report.warnings.join(' ')).toMatch(/DO NOT match/)
  })
  it('parses the exact ID-preserving Supabase SELECT CSV and boolean statuses', () => {
    const csv = 'id,name,sku,branch_id,product_type,is_active\r\n' +
      `${p(1)},"Manufactured, test",,${a},manufactured,true\r\n` +
      `${p(2)},Another,001,${b},ready,false\r\n`
    expect(parseSageIdentityCsv(csv)).toEqual([
      { id: p(1), name: 'Manufactured, test', sku: null, branch_id: a,
        product_type: 'manufactured', is_active: true },
      { id: p(2), name: 'Another', sku: '001', branch_id: b,
        product_type: 'ready', is_active: false },
    ])
    expect(buildSageIdentityAudit(parseSageIdentityCsv(csv)))
      .toMatchObject({ inactive: 1, missingSku: 1, total: 2 })
  })
  it('accepts a missing activation column only as unknown, never assumes active', () => {
    const csv = 'id;name;sku;branch_id;product_type\n' +
      `${p(1)};One;;${a};manufactured\n`
    const report = buildSageIdentityAudit(parseSageIdentityCsv(csv))
    expect(report.unknownActivity).toBe(1)
    expect(report.inactive).toBe(0)
  })
  it('rejects malformed UUIDs, branch IDs, product types, duplicate IDs and invalid active flags', () => {
    expect(() => parseSageIdentityJson([{ ...row(1), id: 'bad' }])).toThrow()
    expect(() => parseSageIdentityJson([{ ...row(1), branch_id: 'bad' }])).toThrow()
    expect(() => parseSageIdentityJson([{ ...row(1), product_type: 'unknown' }])).toThrow()
    expect(() => parseSageIdentityJson([row(1), row(1)])).toThrow('Duplicate')
    expect(() => parseSageIdentityJson([{ ...row(1), is_active: 'maybe' }])).toThrow('is_active')
    expect(() => parseSageIdentityCsv('name,sku,product_type\nFake,,ready\n')).toThrow('columns')
    expect(() => parseSageIdentityCsv('id,name,sku,branch_id,product_type\n"bad,,'))
      .toThrow()
  })
  it('never confuses duplicate names with confirmed cross-system product identity', () => {
    const result = buildSageIdentityAudit(parseSageIdentityJson([
      { ...row(1), name: 'TEA', sku: null },
      { ...row(2), name: ' tea ', sku: null },
      { ...row(3, b), name: 'TEA', sku: null },
    ]))
    expect(result.duplicateNameWithinBranchGroups).toBe(1)
    expect(result.duplicateSkuGroups).toBe(0)
    expect(result.canImport).toBe(false)
    expect(JSON.stringify(result)).not.toContain('Sage product')
  })
})
