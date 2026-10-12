import {
  GarmentsMatrixError,
  type GarmentsCatalogScope,
  type TrustedCatalogVariant,
} from './sku-matrix'

/**
 * Convert four authorized Open Mercato catalog read models into a typed
 * garment variant projection. These are records from canonical catalog
 * tables, NOT new garments-specific products/variants.
 *
 * Consumers must read only within the authenticated tenant + organization,
 * and must not deserialize these records from browser-supplied payloads.
 */
export type CatalogVariantRecord = Readonly<{
  id: string
  tenantId: string
  organizationId: string
  productId: string
  sku: string | null
  isActive: boolean
  deletedAt?: Date | string | null
}>

export type CatalogOptionRecord = Readonly<{
  id: string
  tenantId: string
  organizationId: string
  productId: string
  code: string
}>

export type CatalogOptionValueRecord = Readonly<{
  id: string
  tenantId: string
  organizationId: string
  optionId: string
  code: string
}>

export type CatalogVariantOptionValueRecord = Readonly<{
  variantId: string
  optionValueId: string
  tenantId: string
  organizationId: string
}>

function ensureScope(
  data: { tenantId: string; organizationId: string },
  scope: GarmentsCatalogScope,
): void {
  if (data.tenantId.toLowerCase() !== scope.tenantId.toLowerCase()
    || data.organizationId.toLowerCase() !== scope.organizationId.toLowerCase()) {
    throw new GarmentsMatrixError('CROSS_SCOPE_VARIANT')
  }
}

function canonicalCode(value: string): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/**
 * Strict projection for apparel products configured with `size` and `color`
 * catalog option codes. Extra (e.g. material/fitting) variant dimensions
 * cannot be silently collapsed onto a duplicate 2D production combination.
 */
export function resolveGarmentVariantsFromCatalog(args: {
  scope: GarmentsCatalogScope
  variants: readonly CatalogVariantRecord[]
  options: readonly CatalogOptionRecord[]
  optionValues: readonly CatalogOptionValueRecord[]
  assignments: readonly CatalogVariantOptionValueRecord[]
}): TrustedCatalogVariant[] {
  const { scope, variants, options, optionValues, assignments } = args
  if (!scope || !Array.isArray(variants) || !Array.isArray(options)
    || !Array.isArray(optionValues) || !Array.isArray(assignments)) {
    throw new GarmentsMatrixError('INVALID_INPUT')
  }
  // Bounded projection to prevent untrusted pagination or queries from creating
  // excessive in-memory join work.
  if (variants.length > 5_000 || options.length > 200
    || optionValues.length > 10_000 || assignments.length > 20_000) {
    throw new GarmentsMatrixError('LIMIT_EXCEEDED')
  }
  const dimensions = new Map<string, CatalogOptionRecord>()
  const optionById = new Map<string, CatalogOptionRecord>()
  for (const option of options) {
    ensureScope(option, scope)
    if (option.productId !== scope.productId) throw new GarmentsMatrixError('CROSS_SCOPE_VARIANT')
    if (optionById.has(option.id)) throw new GarmentsMatrixError('INVALID_INPUT')
    optionById.set(option.id, option)
    const code = canonicalCode(option.code)
    if (code !== 'size' && code !== 'color') continue
    if (dimensions.has(code)) throw new GarmentsMatrixError('DUPLICATE_COMBINATION')
    dimensions.set(code, option)
  }
  if (!dimensions.has('size') || !dimensions.has('color')) {
    throw new GarmentsMatrixError('INVALID_DIMENSION')
  }

  const valuesById = new Map<string, { dimension: string; code: string }>()
  for (const value of optionValues) {
    ensureScope(value, scope)
    const owner = optionById.get(value.optionId)
    if (!owner || valuesById.has(value.id)) throw new GarmentsMatrixError('INVALID_INPUT')
    const dimension = canonicalCode(owner.code)
    if (dimension !== 'size' && dimension !== 'color') continue
    valuesById.set(value.id, { dimension, code: value.code })
  }

  const variantById = new Map<string, CatalogVariantRecord>()
  const assignedByVariant = new Map<string, { sizeCode?: string; colorCode?: string }>()
  for (const variant of variants) {
    ensureScope(variant, scope)
    if (variant.productId !== scope.productId || variantById.has(variant.id)) {
      throw new GarmentsMatrixError('CROSS_SCOPE_VARIANT')
    }
    variantById.set(variant.id, variant)
    assignedByVariant.set(variant.id, {})
  }
  for (const assignment of assignments) {
    ensureScope(assignment, scope)
    const attached = assignedByVariant.get(assignment.variantId)
    const matched = valuesById.get(assignment.optionValueId)
    if (!attached || !matched) {
      throw new GarmentsMatrixError('INVALID_INPUT')
    }
    if (matched.dimension === 'size') {
      if (attached.sizeCode !== undefined) throw new GarmentsMatrixError('DUPLICATE_COMBINATION')
      attached.sizeCode = matched.code
    } else {
      if (attached.colorCode !== undefined) throw new GarmentsMatrixError('DUPLICATE_COMBINATION')
      attached.colorCode = matched.code
    }
  }

  const resolved: TrustedCatalogVariant[] = []
  for (const variant of variants) {
    if (variant.deletedAt) continue
    const attributes = assignedByVariant.get(variant.id)
    if (!attributes?.sizeCode || !attributes.colorCode) {
      throw new GarmentsMatrixError('INVALID_DIMENSION')
    }
    resolved.push({
      id: variant.id,
      productId: variant.productId,
      tenantId: variant.tenantId,
      organizationId: variant.organizationId,
      sku: variant.sku ?? '',
      isActive: variant.isActive,
      colorCode: attributes.colorCode,
      sizeCode: attributes.sizeCode,
    })
  }
  return resolved
}
