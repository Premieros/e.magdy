import { parseCsvCells } from './sage-excel-parity'
import { parseLocalSageProducts, type SageLocalProduct } from './sage-catalog-parity'

/** Query for Supabase SQL Editor: use only an authorized owner account.
 *  The result is downloaded by the owner and processed locally. No deployed
 *  credentials, direct Sage API calls or cross-project SQL connections.
 */
export const SAGE_IDENTITY_EXPORT_SQL =
  'SELECT id::text AS id, name, COALESCE(sku, \'\') AS sku, ' +
  'branch_id::text AS branch_id, product_type, is_active ' +
  'FROM public.products ORDER BY branch_id, id;'

export type SageIdentityProduct = SageLocalProduct & Readonly<{ is_active: boolean | null }>
export type SageBranchAudit = Readonly<{
  branchId: string
  total: number
  ready: number
  manufactured: number
  missingSku: number
  inactive: number
  unknownActivity: number
}>
export type SageIdentityAudit = Readonly<{
  schemaVersion: 'premieros.sage.identity-readiness.v1'
  readOnly: true
  canImport: false
  source: 'sage-local-export'
  total: number
  missingSku: number
  manufactured: number
  ready: number
  inactive: number
  unknownActivity: number
  duplicateSkuGroups: number
  duplicateNameWithinBranchGroups: number
  branches: readonly SageBranchAudit[]
  warnings: readonly string[]
}>
const LIMIT = 20000
const MAX_CSV_BYTES = 5_000_000
const REQUIRED_CSV_HEADERS = ['id', 'name', 'sku', 'branch_id', 'product_type'] as const
const normalize = (x: string) => x.trim().toLocaleUpperCase('en-US')

function activeFlag(value: unknown): boolean | null {
  if (value === undefined || value === null || value === '') return null
  if (value === true || value === 'true' || value === 'TRUE' || value === 't') return true
  if (value === false || value === 'false' || value === 'FALSE' || value === 'f') return false
  throw new Error('Unsupported is_active value in Sage export')
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseSageIdentityJson(input: unknown): readonly SageIdentityProduct[] {
  const values: unknown = Array.isArray(input) ? input :
    record(input) ? input.products : undefined
  const basics = parseLocalSageProducts(input)
  if (!Array.isArray(values) || values.length !== basics.length || values.length > LIMIT) {
    throw new Error('Invalid Sage identity JSON payload')
  }
  return basics.map((row, i) => ({
    ...row,
    is_active: activeFlag(record(values[i]) ? values[i].is_active : undefined),
  }))
}

export function parseSageIdentityCsv(raw: string): readonly SageIdentityProduct[] {
  if (raw.length > MAX_CSV_BYTES) throw new Error('Identity CSV exceeds 5 MB')
  const cells = parseCsvCells(raw)
  const header = cells[0]?.map(value => value.trim()) ?? []
  if (header.length > 64 || new Set(header).size !== header.length ||
      REQUIRED_CSV_HEADERS.some(required => !header.includes(required))) {
    throw new Error('Expected Sage SQL export columns: id, name, sku, branch_id, product_type')
  }
  const ix = Object.fromEntries(header.map((v, i) => [v, i])) as Record<string, number>
  const rawRows = cells.slice(1).map((row, i) => {
    if (row.length !== header.length) throw new Error(`Invalid Sage CSV column count at row ${i + 2}`)
    return {
      id: row[ix.id].trim(), name: row[ix.name].trim(),
      sku: row[ix.sku].trim() || null,
      branch_id: row[ix.branch_id].trim(),
      product_type: row[ix.product_type].trim(),
      ...(ix.is_active === undefined ? {} : { is_active: row[ix.is_active].trim() }),
    }
  })
  return parseSageIdentityJson(rawRows)
}

export function buildSageIdentityAudit(products: readonly SageIdentityProduct[]): SageIdentityAudit {
  if (products.length > LIMIT) throw new Error('Too many Sage records for a browser-only report')
  const idSet = new Set<string>()
  const skuCount = new Map<string, number>()
  const branchNameCount = new Map<string, number>()
  const branches = new Map<string, {
    branchId: string; total: number; ready: number; manufactured: number;
    missingSku: number; inactive: number; unknownActivity: number;
  }>()
  for (const product of products) {
    if (idSet.has(product.id)) throw new Error('Duplicate Sage product UUID')
    idSet.add(product.id)
    const branch = branches.get(product.branch_id) ?? {
      branchId: product.branch_id, total: 0, ready: 0, manufactured: 0,
      missingSku: 0, inactive: 0, unknownActivity: 0,
    }
    branch.total++
    branch[product.product_type]++
    if (!product.sku || !product.sku.trim()) branch.missingSku++
    else {
      const code = normalize(product.sku)
      skuCount.set(code, (skuCount.get(code) ?? 0) + 1)
    }
    if (product.is_active === false) branch.inactive++
    if (product.is_active === null) branch.unknownActivity++
    branches.set(product.branch_id, branch)
    const nameKey = product.branch_id + ':' + normalize(product.name)
    branchNameCount.set(nameKey, (branchNameCount.get(nameKey) ?? 0) + 1)
  }
  const byBranch = [...branches.values()].sort((a, b) => a.branchId.localeCompare(b.branchId))
  return {
    schemaVersion: 'premieros.sage.identity-readiness.v1',
    readOnly: true, canImport: false, source: 'sage-local-export',
    total: products.length,
    missingSku: byBranch.reduce((acc, b) => acc + b.missingSku, 0),
    ready: byBranch.reduce((acc, b) => acc + b.ready, 0),
    manufactured: byBranch.reduce((acc, b) => acc + b.manufactured, 0),
    inactive: byBranch.reduce((acc, b) => acc + b.inactive, 0),
    unknownActivity: byBranch.reduce((acc, b) => acc + b.unknownActivity, 0),
    duplicateSkuGroups: [...skuCount.values()].filter(n => n > 1).length,
    duplicateNameWithinBranchGroups: [...branchNameCount.values()].filter(n => n > 1).length,
    branches: byBranch,
    warnings: [
      'The SQL export contains real business data. Keep the file private.',
      'This is a locally provided snapshot, not a proof that all Sage products were exported.',
      'UUIDs preserve original Sage identity, but DO NOT match Open Mercato identities automatically.',
      'No Sage branch-to-organization mapping is approved or applied.',
      'Manufactured products require explicit recipes, production, costing, unit and stock parity.',
      'No product records, SKUs, prices, inventory or accounting entries are changed.',
    ],
  }
}
