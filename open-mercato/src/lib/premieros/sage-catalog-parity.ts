import {
  SAGE_CATALOG_PREVIEW_VERSION,
  type SageCatalogCandidate,
  type SageCatalogPreview,
} from './sage-catalog-bridge'

/**
 * Local browser-only dry-run. Sage's exported products remain in memory in
 * the user's tab: no upload, writes, guessed IDs or database transactions.
 */
export type SageLocalProduct = Readonly<{
  id: string
  name: string
  sku: string | null
  branch_id: string
  product_type: 'ready' | 'manufactured'
}>
export type CatalogParityStatus =
  | 'missing-source-sku'
  | 'duplicate-source-sku'
  | 'missing-in-sage'
  | 'ambiguous-sage-sku'
  | 'candidate-review'
export type CatalogParityRow = Readonly<{
  productId: string
  variantId: string | null
  title: string
  sku: string | null
  sourceType: string
  status: CatalogParityStatus
  sageCandidateId: string | null
  sageBranchId: string | null
}>
export type CatalogParityResult = Readonly<{
  completeSource: boolean
  sourceRows: number
  sageRows: number
  statuses: Readonly<Record<CatalogParityStatus, number>>
  rows: readonly CatalogParityRow[]
  warnings: readonly string[]
}>

const SKU = (sku: string | null) => sku?.trim().toLocaleUpperCase('en-US') ?? ''
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function obj(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function parseLocalSageProducts(input: unknown): readonly SageLocalProduct[] {
  const raw: unknown = Array.isArray(input) ? input : obj(input) ? input.products : undefined
  if (!Array.isArray(raw) || raw.length > 20000) {
    throw new Error('Expected an array of up to 20,000 Sage products')
  }
  const ids = new Set<string>()
  const items: SageLocalProduct[] = []
  for (const [i, value] of raw.entries()) {
    if (!obj(value) || typeof value.id !== 'string' || !UUID.test(value.id) ||
        typeof value.name !== 'string' || value.name.trim().length === 0 ||
        value.name.length > 500 ||
        (typeof value.sku !== 'string' && value.sku !== null) ||
        (typeof value.sku === 'string' && value.sku.length > 200) ||
        typeof value.branch_id !== 'string' || !UUID.test(value.branch_id) ||
        (value.product_type !== 'ready' && value.product_type !== 'manufactured')) {
      throw new Error(`Invalid Sage product at index ${i}; require id, name, sku, branch_id and product_type`)
    }
    if (ids.has(value.id)) throw new Error('Duplicate Sage product ID')
    ids.add(value.id)
    items.push({
      id: value.id, name: value.name, sku: value.sku,
      branch_id: value.branch_id, product_type: value.product_type,
    })
  }
  return items
}

export function parseCatalogPage(value: unknown, tenantId: string, organizationId: string): SageCatalogPreview {
  if (!obj(value) || value.schemaVersion !== SAGE_CATALOG_PREVIEW_VERSION ||
      value.readOnly !== true || value.sourceSystem !== 'open-mercato' ||
      value.tenantId !== tenantId || value.organizationId !== organizationId ||
      !Array.isArray(value.rows) || value.rows.length > 2000 ||
      !Array.isArray(value.warnings) || value.warnings.some(x => typeof x !== 'string') ||
      (value.nextCursor !== null && (typeof value.nextCursor !== 'string' || !UUID.test(value.nextCursor)))) {
    throw new Error('Invalid, unscoped or unsupported Open Mercato preview')
  }
  for (const row of value.rows) {
    if (!obj(row) || typeof row.openMercatoProductId !== 'string' ||
        !UUID.test(row.openMercatoProductId) ||
        (row.openMercatoVariantId !== null &&
          (typeof row.openMercatoVariantId !== 'string' || !UUID.test(row.openMercatoVariantId))) ||
        (row.suggestedSku !== null && typeof row.suggestedSku !== 'string') ||
        typeof row.title !== 'string' ||
        (row.variantName !== null && typeof row.variantName !== 'string') ||
        (row.barcode !== null && typeof row.barcode !== 'string') ||
        typeof row.openMercatoProductType !== 'string' ||
        typeof row.activeInSource !== 'boolean' || row.needsExplicitSageTypeMapping !== true) {
      throw new Error('Malformed or unsupported Open Mercato product candidate')
    }
  }
  return value as unknown as SageCatalogPreview
}

export function analyzeSageCatalogParity(input: {
  source: readonly SageCatalogCandidate[]
  sage: readonly SageLocalProduct[]
  completeSource: boolean
}): CatalogParityResult {
  const { source, sage, completeSource } = input
  const sourceSkus = new Map<string, number>()
  const sageSkus = new Map<string, SageLocalProduct[]>()
  const sourceKeys = new Set<string>()
  for (const row of source) {
    const key = `${row.openMercatoProductId}/${row.openMercatoVariantId ?? ''}`
    if (sourceKeys.has(key)) throw new Error('Duplicated Open Mercato source identity across pages')
    sourceKeys.add(key)
    const sku = SKU(row.suggestedSku)
    if (sku) sourceSkus.set(sku, (sourceSkus.get(sku) ?? 0) + 1)
  }
  for (const row of sage) {
    const sku = SKU(row.sku)
    if (sku) sageSkus.set(sku, [...(sageSkus.get(sku) ?? []), row])
  }
  const counts: Record<CatalogParityStatus, number> = {
    'missing-source-sku': 0,
    'duplicate-source-sku': 0,
    'missing-in-sage': 0,
    'ambiguous-sage-sku': 0,
    'candidate-review': 0,
  }
  const rows: CatalogParityRow[] = source.map(row => {
    const key = SKU(row.suggestedSku)
    const matches = key ? sageSkus.get(key) ?? [] : []
    const status: CatalogParityStatus =
      !key ? 'missing-source-sku' :
      (sourceSkus.get(key) ?? 0) > 1 ? 'duplicate-source-sku' :
      matches.length === 0 ? 'missing-in-sage' :
      matches.length > 1 ? 'ambiguous-sage-sku' : 'candidate-review'
    counts[status]++
    return {
      productId: row.openMercatoProductId,
      variantId: row.openMercatoVariantId,
      title: row.title,
      sku: row.suggestedSku,
      sourceType: row.openMercatoProductType,
      status,
      sageCandidateId: status === 'candidate-review' ? matches[0].id : null,
      sageBranchId: status === 'candidate-review' ? matches[0].branch_id : null,
    }
  })
  const warnings = [
    'Matching SKU never authorizes writing or merging records.',
    'Sage branch and product type are not mapped to Open Mercato organization and product type.',
    'Prices, cost, tax, recipes, units, stock, kitchen and account balances are excluded.',
  ]
  if (!completeSource) warnings.unshift(
    'Source pagination is incomplete: no system-wide matching, uniqueness or readiness may be claimed.',
  )
  return {
    completeSource, sourceRows: source.length, sageRows: sage.length,
    statuses: counts, rows, warnings,
  }
}
