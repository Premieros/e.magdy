import { describe, expect, it } from '@jest/globals'
import {
  buildSageCatalogPreview, SAGE_CATALOG_PREVIEW_VERSION,
  type OpenMercatoCatalogProductSource,
} from '../sage-catalog-bridge'

const org = '22222222-2222-4222-8222-222222222222'
const tenant = '11111111-1111-4111-8111-111111111111'
const products: OpenMercatoCatalogProductSource[] = [
  { id: 'p-1', title: 'Cotton shirt', sku: 'TS-1', productType: 'simple', isActive: true },
  { id: 'p-2', title: 'Made to order', sku: null, productType: 'configurable', isActive: false },
]

const input = () => ({ tenantId: tenant, organizationId: org, products, variants: [
  { id: 'v-2', productId: 'p-1', sku: 'TS-1-L', barcode: '123', name: 'Large', isActive: true },
  { id: 'v-1', productId: 'p-1', sku: 'TS-1-S', barcode: null, name: 'Small', isActive: false },
], nextCursor: 'p-2' })

describe('Sage/Open Mercato catalog read-only boundary', () => {
  it('emits versioned, stable variant-level candidates without inventing Sage types', () => {
    const result = buildSageCatalogPreview(input())
    expect(result.schemaVersion).toBe(SAGE_CATALOG_PREVIEW_VERSION)
    expect(result.readOnly).toBe(true)
    expect(result.sourceSystem).toBe('open-mercato')
    expect(result.organizationId).toBe(org)
    expect(result.nextCursor).toBe('p-2')
    expect(result.rows.map(row => row.suggestedSku)).toEqual(['TS-1-S', 'TS-1-L', null])
    expect(result.rows.map(row => row.activeInSource)).toEqual([false, true, false])
    expect(result.rows.every(row => row.needsExplicitSageTypeMapping)).toBe(true)
    expect(result.rows[2]).toMatchObject({
      openMercatoProductId: 'p-2', openMercatoVariantId: null,
      openMercatoProductType: 'configurable',
    })
  })
  it('never maps cash, cost, price, inventory, branches or tax by guess', () => {
    const result = buildSageCatalogPreview(input())
    for (const row of result.rows) {
      expect(Object.keys(row)).not.toEqual(expect.arrayContaining([
        'salePrice', 'costPrice', 'branchId', 'warehouseId', 'taxRate', 'sageProductType',
      ]))
    }
    expect(result.warnings.join(' ')).toMatch(/not mapped/i)
    expect(result.warnings.join(' ')).toMatch(/Missing SKU/i)
  })
  it('flags duplicate case-insensitive SKU candidates instead of picking a winner', () => {
    const v = input()
    const result = buildSageCatalogPreview({
      ...v,
      variants: [{ id: 'v-4', productId: 'p-1', sku: 'SKU-X', isActive: true },
        { id: 'v-5', productId: 'p-1', sku: 'sku-x', isActive: true }],
    })
    expect(result.warnings.join(' ')).toMatch(/Duplicate SKU/)
  })
  it('rejects orphan variants and duplicate IDs rather than widening source scope', () => {
    expect(() => buildSageCatalogPreview({ ...input(), variants: [
      { id: 'v-1', productId: 'other-org-product', sku: 'UNSAFE', isActive: true },
    ] })).toThrow('orphan')
    expect(() => buildSageCatalogPreview({ ...input(), products: [products[0], products[0]] }))
      .toThrow('Duplicate')
    expect(() => buildSageCatalogPreview({ ...input(), organizationId: '' }))
      .toThrow('organization')
  })
  it('supports an empty source page without inventing a Sage product', () => {
    const result = buildSageCatalogPreview({
      tenantId: tenant, organizationId: org, products: [], variants: [], nextCursor: null,
    })
    expect(result.rows).toEqual([])
    expect(result.nextCursor).toBeNull()
  })
})
