/**
 * Read-only interoperability contract for a future Sage catalog importer.
 *
 * This deliberately does not invent Sage's branch, category, recipe, tax,
 * cost, price, stock, unit, or product_type mappings. No SQL or write path.
 */
export const SAGE_CATALOG_PREVIEW_VERSION = 'premieros.sage.catalog-preview.v1' as const

export type OpenMercatoCatalogProductSource = Readonly<{
  id: string
  title: string
  sku?: string | null
  productType: string
  isActive: boolean
}>
export type OpenMercatoCatalogVariantSource = Readonly<{
  id: string
  productId: string
  name?: string | null
  sku?: string | null
  barcode?: string | null
  isActive: boolean
}>
export type SageCatalogCandidate = Readonly<{
  openMercatoProductId: string
  openMercatoVariantId: string | null
  suggestedSku: string | null
  title: string
  variantName: string | null
  barcode: string | null
  openMercatoProductType: string
  activeInSource: boolean
  needsExplicitSageTypeMapping: true
}>
export type SageCatalogPreview = Readonly<{
  schemaVersion: typeof SAGE_CATALOG_PREVIEW_VERSION
  sourceSystem: 'open-mercato'
  readOnly: true
  tenantId: string
  organizationId: string
  rows: readonly SageCatalogCandidate[]
  warnings: readonly string[]
  nextCursor: string | null
}>

function normalizedCode(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length ? trimmed : null
}

export function buildSageCatalogPreview(input: {
  tenantId: string
  organizationId: string
  products: readonly OpenMercatoCatalogProductSource[]
  variants: readonly OpenMercatoCatalogVariantSource[]
  nextCursor: string | null
}): SageCatalogPreview {
  const { tenantId, organizationId, products, variants, nextCursor } = input
  if (!tenantId || !organizationId) throw new Error('An explicit tenant and organization are required')
  const ids = new Set(products.map(product => product.id))
  if (ids.size !== products.length || products.some(product => !product.id)) {
    throw new Error('Duplicate or missing source product ID')
  }
  const byProduct = new Map<string, OpenMercatoCatalogVariantSource[]>()
  const variantIds = new Set<string>()
  for (const variant of variants) {
    if (!ids.has(variant.productId) || !variant.id || variantIds.has(variant.id)) {
      throw new Error('Unscoped, duplicate, or orphan source variant')
    }
    variantIds.add(variant.id)
    const group = byProduct.get(variant.productId) ?? []
    group.push(variant)
    byProduct.set(variant.productId, group)
  }
  const rows: SageCatalogCandidate[] = []
  const warnings = new Set<string>()
  for (const product of products) {
    const matching = byProduct.get(product.id) ?? []
    const selected: Array<OpenMercatoCatalogVariantSource | null> = matching.length
      ? matching.sort((a, b) => a.id.localeCompare(b.id))
      : [null]
    for (const variant of selected) {
      const suggestedSku = normalizedCode(variant?.sku) ?? normalizedCode(product.sku)
      const row: SageCatalogCandidate = {
        openMercatoProductId: product.id,
        openMercatoVariantId: variant?.id ?? null,
        suggestedSku,
        title: product.title,
        variantName: variant?.name ?? null,
        barcode: normalizedCode(variant?.barcode),
        openMercatoProductType: product.productType,
        activeInSource: product.isActive && (variant?.isActive ?? true),
        needsExplicitSageTypeMapping: true,
      }
      if (!suggestedSku) warnings.add('Missing SKU: source IDs must be mapped manually before any import')
      rows.push(row)
    }
  }
  const skuOwners = new Map<string, string>()
  for (const row of rows) {
    if (!row.suggestedSku) continue
    const key = row.suggestedSku.toLocaleUpperCase('en-US')
    const owner = `${row.openMercatoProductId}:${row.openMercatoVariantId ?? ''}`
    if (skuOwners.has(key) && skuOwners.get(key) !== owner) {
      warnings.add('Duplicate SKU on this page: never auto-match or overwrite Sage records')
    }
    skuOwners.set(key, owner)
  }
  // Page-local SKU uniqueness is not global uniqueness. An importer must
  // verify all pages and branch/warehouse business context before matching.
  warnings.add('Read-only preview; branch, recipes, taxes, prices, costs, and stock are NOT mapped')
  return {
    schemaVersion: SAGE_CATALOG_PREVIEW_VERSION,
    sourceSystem: 'open-mercato',
    readOnly: true,
    tenantId,
    organizationId,
    rows,
    warnings: [...warnings],
    nextCursor,
  }
}
