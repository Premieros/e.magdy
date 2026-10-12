import {
  buildGarmentsSkuMatrixPlan,
  GarmentsMatrixError,
  MAX_GRID_PIECES,
  type GarmentsCatalogScope,
  type RequestedGridCell,
  type TrustedCatalogVariant,
} from '../sku-matrix'

const scope: GarmentsCatalogScope = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  productId: '33333333-3333-4333-8333-333333333333',
}

function makeId(index: number): string {
  return `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`
}

function makeVariants(): TrustedCatalogVariant[] {
  let i = 0
  return ['black', 'navy'].flatMap((colorCode) =>
    ['s', 'm', 'l'].map((sizeCode) => {
      i++
      return {
        ...scope,
        id: makeId(i),
        sku: `TS-${colorCode.toUpperCase()}-${sizeCode.toUpperCase()}`,
        colorCode,
        sizeCode,
        isActive: true,
      }
    }),
  )
}

function plan(
  requestedCells: readonly RequestedGridCell[],
  variants = makeVariants(),
  selectedScope = scope,
) {
  return buildGarmentsSkuMatrixPlan({
    scope: selectedScope,
    catalogVariants: variants,
    requestedCells,
  })
}

const fullGrid = [
  { colorCode: 'navy', sizeCode: 'l', quantity: 6 },
  { colorCode: 'black', sizeCode: 's', quantity: 1 },
  { colorCode: 'black', sizeCode: 'm', quantity: 2 },
  { colorCode: 'black', sizeCode: 'l', quantity: 3 },
  { colorCode: 'navy', sizeCode: 's', quantity: 4 },
  { colorCode: 'navy', sizeCode: 'm', quantity: 5 },
]

describe('garments_catalog sku matrix', () => {
  it('resolves a 3 × 2 grid to six existing catalog SKUs in deterministic order', () => {
    const expected = plan(fullGrid)
    expect(expected.totalPieces).toBe(21)
    expect(expected.lines).toHaveLength(6)
    expect(expected.lines.map((line) => [line.colorCode, line.sizeCode])).toEqual([
      ['black', 'l'], ['black', 'm'], ['black', 's'],
      ['navy', 'l'], ['navy', 'm'], ['navy', 's'],
    ])
    expect(expected.lines.every((line) => line.productVariantId.startsWith('44444444'))).toBe(true)
    expect(plan([...fullGrid].reverse())).toEqual(expected)
  })

  it('does not accept repeated matrix cells after case and whitespace normalization', () => {
    expect(() => plan([
      { colorCode: ' NAVY ', sizeCode: 'L', quantity: 2 },
      { colorCode: 'navy', sizeCode: 'l', quantity: 1 },
    ])).toThrow(new GarmentsMatrixError('DUPLICATE_REQUEST'))
  })

  it('rejects an unknown, inactive, or malformed combination', () => {
    expect(() => plan([{ colorCode: 'red', sizeCode: 's', quantity: 1 }]))
      .toThrow(new GarmentsMatrixError('UNKNOWN_COMBINATION'))
    const variants = makeVariants()
    variants[0] = { ...variants[0], isActive: false }
    expect(() => plan([{ colorCode: 'black', sizeCode: 's', quantity: 1 }], variants))
      .toThrow(new GarmentsMatrixError('INACTIVE_VARIANT'))
    expect(() => plan([{ colorCode: 'n:avy', sizeCode: 's', quantity: 1 }]))
      .toThrow(new GarmentsMatrixError('INVALID_DIMENSION'))
  })

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid production quantity %s',
    (quantity) => expect(() => plan([{ colorCode: 'navy', sizeCode: 'l', quantity }]))
      .toThrow(new GarmentsMatrixError('INVALID_QUANTITY')),
  )

  it('rejects totals beyond the configured planning limit', () => {
    const tooMany = [
      { colorCode: 'black', sizeCode: 's', quantity: MAX_GRID_PIECES },
      { colorCode: 'navy', sizeCode: 's', quantity: 1 },
    ]
    expect(() => plan(tooMany)).toThrow(new GarmentsMatrixError('LIMIT_EXCEEDED'))
  })

  it('rejects duplicated variant IDs, SKUs, or color/size pairs', () => {
    const variants = makeVariants()
    const duplicatedId = { ...variants[1], id: variants[0].id }
    expect(() => plan(fullGrid, [variants[0], duplicatedId]))
      .toThrow(new GarmentsMatrixError('DUPLICATE_VARIANT'))
    const duplicatedSku = { ...variants[1], sku: variants[0].sku.toLowerCase() }
    expect(() => plan(fullGrid, [variants[0], duplicatedSku]))
      .toThrow(new GarmentsMatrixError('DUPLICATE_SKU'))
    const duplicatedPair = { ...variants[1], sizeCode: variants[0].sizeCode }
    expect(() => plan(fullGrid, [variants[0], duplicatedPair]))
      .toThrow(new GarmentsMatrixError('DUPLICATE_COMBINATION'))
  })

  it('fails closed if an input variant belongs to another tenant, org or product', () => {
    const variants = makeVariants()
    for (const changed of [
      { tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      { organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      { productId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    ]) {
      expect(() => plan([{ colorCode: 'black', sizeCode: 's', quantity: 1 }],
        [{ ...variants[0], ...changed }]))
        .toThrow(new GarmentsMatrixError('CROSS_SCOPE_VARIANT'))
    }
  })

  it('rejects empty requests and malformed authenticated scope', () => {
    expect(() => plan([])).toThrow(new GarmentsMatrixError('INVALID_INPUT'))
    expect(() => plan(fullGrid, makeVariants(), { ...scope, tenantId: '' }))
      .toThrow(new GarmentsMatrixError('INVALID_SCOPE'))
  })

  it('returns preview values only, without mutating the input objects', () => {
    const variants = makeVariants()
    const first = { colorCode: 'black', sizeCode: 'm', quantity: 9 }
    const savedVariants = JSON.stringify(variants)
    const result = plan([first], variants)
    expect(result.lines[0]).toMatchObject({
      productVariantId: variants[1].id,
      sku: variants[1].sku,
      quantity: 9,
    })
    expect(JSON.stringify(variants)).toEqual(savedVariants)
    expect(first).toEqual({ colorCode: 'black', sizeCode: 'm', quantity: 9 })
  })
})
