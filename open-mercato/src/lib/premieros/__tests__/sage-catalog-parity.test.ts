import { describe, expect, it } from '@jest/globals'
import {
  analyzeSageCatalogParity, parseCatalogPage, parseLocalSageProducts,
} from '../sage-catalog-parity'
import { SAGE_CATALOG_PREVIEW_VERSION, type SageCatalogCandidate } from '../sage-catalog-bridge'

const tenant = '11111111-1111-4111-8111-111111111111'
const org = '22222222-2222-4222-8222-222222222222'
const branch = '33333333-3333-4333-8333-333333333333'
const sageId = '44444444-4444-4444-8444-444444444444'
const row: SageCatalogCandidate = {
  openMercatoProductId: '55555555-5555-4555-8555-555555555555',
  openMercatoVariantId: '66666666-6666-4666-8666-666666666666',
  suggestedSku: ' ONE ', title: 'Tee', variantName: 'M', barcode: null,
  openMercatoProductType: 'simple', activeInSource: true,
  needsExplicitSageTypeMapping: true,
}
const sage = [{ id: sageId, name: 'Sage tee', sku: 'one',
  branch_id: branch, product_type: 'ready' as const }]

describe('Sage parity local-only dry run', () => {
  it('only accepts scoped, versioned read-only native catalog pages', () => {
    const page = {
      schemaVersion: SAGE_CATALOG_PREVIEW_VERSION,
      sourceSystem: 'open-mercato', readOnly: true,
      tenantId: tenant, organizationId: org, rows: [row], warnings: [], nextCursor: null,
    }
    expect(parseCatalogPage(page, tenant, org)).toEqual(page)
    expect(() => parseCatalogPage({ ...page, tenantId: branch }, tenant, org)).toThrow('unscoped')
    expect(() => parseCatalogPage({ ...page, readOnly: false }, tenant, org)).toThrow()
    expect(() => parseCatalogPage({ ...page, nextCursor: 'bad' }, tenant, org)).toThrow()
    expect(() => parseCatalogPage({ ...page, rows: [{ ...row, needsExplicitSageTypeMapping: false }] }, tenant, org)).toThrow()
    expect(() => parseCatalogPage({ ...page, rows: Array(2001).fill(row) }, tenant, org)).toThrow()
  })
  it('validates Sage branch, ID and type; never silently assigns missing fields', () => {
    expect(parseLocalSageProducts(sage)).toEqual(sage)
    expect(parseLocalSageProducts({ products: sage })).toEqual(sage)
    expect(() => parseLocalSageProducts([{ ...sage[0], branch_id: undefined }])).toThrow()
    expect(() => parseLocalSageProducts([{ ...sage[0], product_type: 'guessed' }])).toThrow()
    expect(() => parseLocalSageProducts([{ ...sage[0], sku: undefined }])).toThrow()
    expect(() => parseLocalSageProducts([...sage, sage[0]])).toThrow('Duplicate')
    expect(() => parseLocalSageProducts({ anything: sage })).toThrow()
  })
  it('detects exact one-candidate SKU without approving any import', () => {
    const result = analyzeSageCatalogParity({ source: [row], sage, completeSource: true })
    expect(result.rows[0]).toMatchObject({
      status: 'candidate-review', sageCandidateId: sageId, sageBranchId: branch,
    })
    expect(result.warnings.join(' ')).toMatch(/never authorizes writing/)
    expect(result.warnings.join(' ')).toMatch(/not mapped/)
  })
  it('rejects automatic SKU matches across multiple Sage branches', () => {
    const extra = { ...sage[0], id: '77777777-7777-4777-8777-777777777777',
      branch_id: '88888888-8888-4888-8888-888888888888' }
    const result = analyzeSageCatalogParity({
      source: [row], sage: [...sage, extra], completeSource: true,
    })
    expect(result.rows[0]).toMatchObject({
      status: 'ambiguous-sage-sku', sageCandidateId: null, sageBranchId: null,
    })
  })
  it('detects source SKU duplicates across pages and missing SKU', () => {
    const result = analyzeSageCatalogParity({
      source: [row, { ...row, openMercatoVariantId: null, suggestedSku: 'one' },
        { ...row, openMercatoProductId: '99999999-9999-4999-8999-999999999999',
          suggestedSku: null }],
      sage, completeSource: false,
    })
    expect(result.statuses['duplicate-source-sku']).toBe(2)
    expect(result.statuses['missing-source-sku']).toBe(1)
    expect(result.completeSource).toBe(false)
    expect(result.warnings.join(' ')).toMatch(/incomplete/)
  })
  it('does not interpret absent Sage records as permission to create them', () => {
    const result = analyzeSageCatalogParity({ source: [row], sage: [], completeSource: true })
    expect(result.rows[0].status).toBe('missing-in-sage')
    expect(result.rows[0].sageCandidateId).toBeNull()
    expect(Object.keys(result.rows[0])).not.toContain('writeAction')
  })
  it('fails closed on repeated canonical IDs between pages', () => {
    expect(() => analyzeSageCatalogParity({
      source: [row, { ...row }], sage, completeSource: true,
    })).toThrow('Duplicated')
  })
})
