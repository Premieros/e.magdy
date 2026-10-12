/**
 * Garments P1: pure, read-only mapping of a proposed size/color plan onto
 * canonical Open Mercato catalog variants. This file does NOT perform auth:
 * callers MUST first resolve the variants in the authorized catalog context.
 *
 * There is intentionally no independent SKU table, SQL query, WMS mutation,
 * inventory number, order or production posting in this module.
 */
export type GarmentsCatalogScope = Readonly<{
  tenantId: string
  organizationId: string
  productId: string
}>

export type TrustedCatalogVariant = Readonly<{
  id: string
  productId: string
  tenantId: string
  organizationId: string
  sku: string
  isActive: boolean
  /** Codes resolved from canonical catalog option values, never from client input. */
  colorCode: string
  sizeCode: string
}>

export type RequestedGridCell = Readonly<{
  colorCode: string
  sizeCode: string
  quantity: number
}>

export type PlannedSkuLine = Readonly<{
  productVariantId: string
  sku: string
  colorCode: string
  sizeCode: string
  quantity: number
}>

export type SkuMatrixPlan = Readonly<{
  productId: string
  lines: readonly PlannedSkuLine[]
  totalPieces: number
}>

export type GarmentsMatrixErrorCode =
  | 'INVALID_SCOPE'
  | 'INVALID_INPUT'
  | 'INVALID_DIMENSION'
  | 'DUPLICATE_VARIANT'
  | 'DUPLICATE_SKU'
  | 'DUPLICATE_COMBINATION'
  | 'DUPLICATE_REQUEST'
  | 'CROSS_SCOPE_VARIANT'
  | 'UNKNOWN_COMBINATION'
  | 'INACTIVE_VARIANT'
  | 'INVALID_QUANTITY'
  | 'LIMIT_EXCEEDED'

export class GarmentsMatrixError extends Error {
  constructor(readonly code: GarmentsMatrixErrorCode) {
    super(`GARMENTS_MATRIX_${code}`)
    this.name = 'GarmentsMatrixError'
  }
}

export const MAX_GRID_CELLS = 1_000
export const MAX_GRID_PIECES = 1_000_000
export const MAX_CATALOG_VARIANTS = 5_000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OPTION_CODE_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/

function assertUuid(id: string): boolean {
  return typeof id === 'string' && UUID_RE.test(id)
}

function parseOptionCode(input: unknown): string {
  if (typeof input !== 'string') throw new GarmentsMatrixError('INVALID_DIMENSION')
  const normalized = input.trim().toLowerCase()
  if (!OPTION_CODE_RE.test(normalized)) throw new GarmentsMatrixError('INVALID_DIMENSION')
  return normalized
}

function combinationKey(colorCode: string, sizeCode: string): string {
  // A delimiter disallowed by OPTION_CODE_RE makes this encoding injective.
  return `${colorCode}:${sizeCode}`
}

function lexicalCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Build a planning *preview*. Catalog variant snapshots must be retrieved
 * through authorized server-side catalog APIs/DI, not supplied by browsers.
 * Zero-quantity cells must be omitted by the caller, rather than inventing a
 * work order with zero units.
 */
export function buildGarmentsSkuMatrixPlan(input: {
  scope: GarmentsCatalogScope
  catalogVariants: readonly TrustedCatalogVariant[]
  requestedCells: readonly RequestedGridCell[]
}): SkuMatrixPlan {
  const { scope, catalogVariants, requestedCells } = input
  if (!scope || !assertUuid(scope.tenantId) || !assertUuid(scope.organizationId) || !assertUuid(scope.productId)) {
    throw new GarmentsMatrixError('INVALID_SCOPE')
  }
  if (!Array.isArray(catalogVariants) || !Array.isArray(requestedCells) || requestedCells.length === 0) {
    throw new GarmentsMatrixError('INVALID_INPUT')
  }
  if (requestedCells.length > MAX_GRID_CELLS || catalogVariants.length > MAX_CATALOG_VARIANTS) {
    throw new GarmentsMatrixError('LIMIT_EXCEEDED')
  }

  const byCombination = new Map<string, TrustedCatalogVariant>()
  const variantIds = new Set<string>()
  const skus = new Set<string>()
  for (const variant of catalogVariants) {
    if (!variant || !assertUuid(variant.id) || !assertUuid(variant.productId)
      || !assertUuid(variant.tenantId) || !assertUuid(variant.organizationId)) {
      throw new GarmentsMatrixError('INVALID_INPUT')
    }
    if (variant.tenantId.toLowerCase() !== scope.tenantId.toLowerCase()
      || variant.organizationId.toLowerCase() !== scope.organizationId.toLowerCase()
      || variant.productId.toLowerCase() !== scope.productId.toLowerCase()) {
      throw new GarmentsMatrixError('CROSS_SCOPE_VARIANT')
    }
    const sku = typeof variant.sku === 'string' ? variant.sku.trim() : ''
    if (!sku || sku.length > 128) throw new GarmentsMatrixError('INVALID_INPUT')
    const variantId = variant.id.toLowerCase()
    if (variantIds.has(variantId)) throw new GarmentsMatrixError('DUPLICATE_VARIANT')
    variantIds.add(variantId)

    const normalizedSku = sku.toLowerCase()
    if (skus.has(normalizedSku)) throw new GarmentsMatrixError('DUPLICATE_SKU')
    skus.add(normalizedSku)

    const key = combinationKey(parseOptionCode(variant.colorCode), parseOptionCode(variant.sizeCode))
    if (byCombination.has(key)) throw new GarmentsMatrixError('DUPLICATE_COMBINATION')
    byCombination.set(key, variant)
  }

  const requestedKeys = new Set<string>()
  const result: PlannedSkuLine[] = []
  let totalPieces = 0
  for (const request of requestedCells) {
    if (!request) throw new GarmentsMatrixError('INVALID_INPUT')
    const colorCode = parseOptionCode(request.colorCode)
    const sizeCode = parseOptionCode(request.sizeCode)
    const key = combinationKey(colorCode, sizeCode)
    if (requestedKeys.has(key)) throw new GarmentsMatrixError('DUPLICATE_REQUEST')
    requestedKeys.add(key)

    if (typeof request.quantity !== 'number' || !Number.isSafeInteger(request.quantity)
      || request.quantity < 1) {
      throw new GarmentsMatrixError('INVALID_QUANTITY')
    }
    totalPieces += request.quantity
    if (!Number.isSafeInteger(totalPieces) || totalPieces > MAX_GRID_PIECES) {
      throw new GarmentsMatrixError('LIMIT_EXCEEDED')
    }

    const variant = byCombination.get(key)
    if (!variant) throw new GarmentsMatrixError('UNKNOWN_COMBINATION')
    if (variant.isActive !== true) throw new GarmentsMatrixError('INACTIVE_VARIANT')
    result.push({
      productVariantId: variant.id,
      sku: variant.sku.trim(),
      colorCode,
      sizeCode,
      quantity: request.quantity,
    })
  }
  result.sort((a, b) =>
    lexicalCompare(a.colorCode, b.colorCode) ||
    lexicalCompare(a.sizeCode, b.sizeCode) ||
    lexicalCompare(a.productVariantId, b.productVariantId),
  )
  return { productId: scope.productId, lines: result, totalPieces }
}
