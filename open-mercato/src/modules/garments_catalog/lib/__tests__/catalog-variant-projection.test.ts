import { resolveGarmentVariantsFromCatalog } from '../catalog-variant-projection'
import { buildGarmentsSkuMatrixPlan, GarmentsMatrixError } from '../sku-matrix'

const scope = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  productId: '33333333-3333-4333-8333-333333333333',
}
const colorOption = { ...scope, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', code: 'color' }
const sizeOption = { ...scope, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', code: 'size' }
const navy = { ...scope, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', optionId: colorOption.id, code: 'navy' }
const medium = { ...scope, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', optionId: sizeOption.id, code: 'm' }
const large = { ...scope, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', optionId: sizeOption.id, code: 'l' }
const first = { ...scope, id: '44444444-4444-4444-8444-000000000001', sku: 'TS-NAVY-M', isActive: true }
const second = { ...scope, id: '44444444-4444-4444-8444-000000000002', sku: 'TS-NAVY-L', isActive: true }

function records() {
  return {
    scope,
    options: [colorOption, sizeOption],
    optionValues: [navy, medium, large],
    variants: [first, second],
    assignments: [
      { ...scope, variantId: first.id, optionValueId: navy.id },
      { ...scope, variantId: first.id, optionValueId: medium.id },
      { ...scope, variantId: second.id, optionValueId: navy.id },
      { ...scope, variantId: second.id, optionValueId: large.id },
    ],
  }
}

describe('garments_catalog canonical catalog projection', () => {
  it('uses canonical option-value assignments to map existing SKU identities', () => {
    const resolved = resolveGarmentVariantsFromCatalog(records())
    const plan = buildGarmentsSkuMatrixPlan({
      scope,
      catalogVariants: resolved,
      requestedCells: [
        { colorCode: 'navy', sizeCode: 'l', quantity: 11 },
        { colorCode: 'navy', sizeCode: 'm', quantity: 5 },
      ],
    })
    expect(plan.lines.map(({ productVariantId, sku, quantity }) =>
      ({ productVariantId, sku, quantity }))).toEqual([
      { productVariantId: second.id, sku: second.sku, quantity: 11 },
      { productVariantId: first.id, sku: first.sku, quantity: 5 },
    ])
  })

  it('rejects wrong-tenant option values rather than joining across organizations', () => {
    const input = records()
    input.optionValues[0] = {
      ...navy,
      tenantId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    }
    expect(() => resolveGarmentVariantsFromCatalog(input))
      .toThrow(new GarmentsMatrixError('CROSS_SCOPE_VARIANT'))
  })

  it('rejects missing canonical size/color option assignment', () => {
    const input = records()
    input.assignments.splice(1, 1)
    expect(() => resolveGarmentVariantsFromCatalog(input))
      .toThrow(new GarmentsMatrixError('INVALID_DIMENSION'))
  })

  it('rejects ambiguous double size assignment for one SKU', () => {
    const input = records()
    input.assignments.push({ ...scope, variantId: first.id, optionValueId: large.id })
    expect(() => resolveGarmentVariantsFromCatalog(input))
      .toThrow(new GarmentsMatrixError('DUPLICATE_COMBINATION'))
  })

  it('skips catalog-deleted variants and never creates a new SKU', () => {
    const input = records()
    input.variants[1] = { ...second, deletedAt: '2026-10-01T00:00:00.000Z' }
    const visible = resolveGarmentVariantsFromCatalog(input)
    expect(visible).toHaveLength(1)
    expect(visible[0].id).toBe(first.id)
    expect(visible[0].sku).toBe(first.sku)
  })

  it('rejects a missing apparel dimension on the style', () => {
    const input = records()
    input.options = [colorOption]
    expect(() => resolveGarmentVariantsFromCatalog(input))
      .toThrow(new GarmentsMatrixError('INVALID_DIMENSION'))
  })
})
