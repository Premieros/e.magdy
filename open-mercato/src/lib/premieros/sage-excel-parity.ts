import type { SageCatalogCandidate } from './sage-catalog-bridge'

/**
 * Sage's existing Products > Export uses SheetJS to emit an XLSX spreadsheet
 * with Name/SKU/ProductType, but deliberately omits stable id and branch_id.
 * Operators can Save As UTF-8 CSV locally and compare *hints*, not identities.
 * No external parser service, upload, database reads, or write/sync path.
 */
export type SageSpreadsheetProduct = Readonly<{
  spreadsheetRow: number
  name: string
  sku: string | null
  productType: string
  barcode: string | null
}>
export type SageSpreadsheetStatus =
  | 'missing-source-sku'
  | 'duplicate-source-sku'
  | 'no-spreadsheet-match'
  | 'ambiguous-spreadsheet-sku'
  | 'sku-overlap-unverified'
export type SageSpreadsheetParityRow = Readonly<{
  openMercatoProductId: string
  openMercatoVariantId: string | null
  title: string
  sku: string | null
  status: SageSpreadsheetStatus
  spreadsheetRow: number | null
  spreadsheetName: string | null
  identityVerified: false
}>
export type SageSpreadsheetParityReport = Readonly<{
  schemaVersion: 'premieros.sage.spreadsheet-parity.v1'
  mode: 'sku-hints-only'
  readOnly: true
  completeSource: boolean
  canImport: false
  sourceRows: number
  spreadsheetRows: number
  statuses: Readonly<Record<SageSpreadsheetStatus, number>>
  rows: readonly SageSpreadsheetParityRow[]
  warnings: readonly string[]
}>
const MAX_CSV_CHARS = 5_000_000
const MAX_SPREADSHEET_ROWS = 20_000
const MAX_COLUMNS = 64
const requiredHeaders = ['Name', 'SKU', 'ProductType'] as const
const normalizeSku = (v: string | null) => v?.trim().toLocaleUpperCase('en-US') ?? ''

function detectDelimiter(header: string): ',' | ';' | '\t' {
  const score = (delimiter: string) => header.split(delimiter).length - 1
  const scores: Array<',' | ';' | '\t'> = [',', ';', '\t']
  return scores.sort((a, b) => score(b) - score(a))[0]
}

/** Small, strict RFC 4180 parser. Sheets must be saved as UTF-8 CSV. */
export function parseCsvCells(raw: string): string[][] {
  if (raw.length > MAX_CSV_CHARS) throw new Error('CSV exceeds the 5 MB comparison limit')
  const input = raw.replace(/^\uFEFF/, '')
  const headerEnd = input.search(/\r|\n/)
  const delimiter = detectDelimiter(input.slice(0, headerEnd < 0 ? input.length : headerEnd))
  const lines: string[][] = []
  let cells: string[] = []
  let value = ''
  let quoted = false
  let afterClosingQuote = false

  function addCell() {
    if (cells.length >= MAX_COLUMNS) throw new Error('Too many CSV columns')
    cells.push(value)
    value = ''
    afterClosingQuote = false
  }
  function addLine() {
    addCell()
    if (cells.some(cell => cell.trim() !== '')) lines.push(cells)
    cells = []
    if (lines.length > MAX_SPREADSHEET_ROWS + 1) {
      throw new Error('Too many spreadsheet rows')
    }
  }
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { value += '"'; i++ }
        else { quoted = false; afterClosingQuote = true }
      } else value += char
      continue
    }
    if (char === delimiter) { addCell(); continue }
    if (char === '\r' || char === '\n') {
      addLine()
      if (char === '\r' && input[i + 1] === '\n') i++
      continue
    }
    if (char === '"') {
      if (value !== '' || afterClosingQuote) throw new Error('Invalid CSV quotation')
      quoted = true
    } else {
      if (afterClosingQuote) throw new Error('Text after closing CSV quote')
      value += char
    }
  }
  if (quoted) throw new Error('Unclosed CSV quotation')
  if (value.length || cells.length || afterClosingQuote) addLine()
  return lines
}

export function parseSageProductsCsv(csv: string): readonly SageSpreadsheetProduct[] {
  const records = parseCsvCells(csv)
  const header = records[0]?.map(v => v.trim()) ?? []
  if (new Set(header).size !== header.length ||
      requiredHeaders.some(name => !header.includes(name))) {
    throw new Error('Expected Sage Excel-export headers: Name, SKU, ProductType')
  }
  const indexes = Object.fromEntries(header.map((h, i) => [h, i])) as Record<string, number>
  return records.slice(1).map((row, i) => {
    if (row.length !== header.length) throw new Error(`Wrong column count in row ${i + 2}`)
    const name = row[indexes.Name].trim()
    const sku = row[indexes.SKU].trim()
    const productType = row[indexes.ProductType].trim()
    const barcode = indexes.Barcode === undefined ? '' : row[indexes.Barcode].trim()
    if (!name || name.length > 500 || sku.length > 200 || barcode.length > 200 ||
        (productType !== 'ready' && productType !== 'manufactured')) {
      throw new Error(`Invalid Sage spreadsheet product in row ${i + 2}`)
    }
    return {
      spreadsheetRow: i + 2, name, sku: sku || null,
      productType, barcode: barcode || null,
    }
  })
}

export function analyzeSageSpreadsheetParity(input: {
  source: readonly SageCatalogCandidate[]
  spreadsheet: readonly SageSpreadsheetProduct[]
  completeSource: boolean
}): SageSpreadsheetParityReport {
  const { source, spreadsheet, completeSource } = input
  const seenSourceIds = new Set<string>()
  const sourceSkuCounts = new Map<string, number>()
  const sheetBySku = new Map<string, SageSpreadsheetProduct[]>()
  for (const row of source) {
    const id = `${row.openMercatoProductId}/${row.openMercatoVariantId ?? ''}`
    if (seenSourceIds.has(id)) throw new Error('Duplicate source identity across pages')
    seenSourceIds.add(id)
    const sku = normalizeSku(row.suggestedSku)
    if (sku) sourceSkuCounts.set(sku, (sourceSkuCounts.get(sku) ?? 0) + 1)
  }
  for (const row of spreadsheet) {
    const sku = normalizeSku(row.sku)
    if (sku) sheetBySku.set(sku, [...(sheetBySku.get(sku) ?? []), row])
  }
  const statuses: Record<SageSpreadsheetStatus, number> = {
    'missing-source-sku': 0,
    'duplicate-source-sku': 0,
    'no-spreadsheet-match': 0,
    'ambiguous-spreadsheet-sku': 0,
    'sku-overlap-unverified': 0,
  }
  const rows: SageSpreadsheetParityRow[] = source.map(row => {
    const normalized = normalizeSku(row.suggestedSku)
    const matches = normalized ? sheetBySku.get(normalized) ?? [] : []
    const status: SageSpreadsheetStatus =
      !normalized ? 'missing-source-sku' :
      (sourceSkuCounts.get(normalized) ?? 0) > 1 ? 'duplicate-source-sku' :
      matches.length === 0 ? 'no-spreadsheet-match' :
      matches.length > 1 ? 'ambiguous-spreadsheet-sku' : 'sku-overlap-unverified'
    statuses[status]++
    return {
      openMercatoProductId: row.openMercatoProductId,
      openMercatoVariantId: row.openMercatoVariantId,
      title: row.title,
      sku: row.suggestedSku,
      status,
      spreadsheetRow: status === 'sku-overlap-unverified' ? matches[0].spreadsheetRow : null,
      spreadsheetName: status === 'sku-overlap-unverified' ? matches[0].name : null,
      identityVerified: false,
    }
  })
  return {
    schemaVersion: 'premieros.sage.spreadsheet-parity.v1',
    mode: 'sku-hints-only',
    readOnly: true,
    completeSource,
    canImport: false,
    sourceRows: source.length,
    spreadsheetRows: spreadsheet.length,
    statuses,
    rows,
    warnings: [
      ...(!completeSource ? ['Incomplete Open Mercato source pagination; totals and SKU uniqueness are not global'] : []),
      'Sage existing Excel export omits immutable product ID and branch ID. Every SKU match is unverified.',
      'No branch, product type, unit, recipe, tax, stock, cost, or sale price mapping. Never import from this report.',
      'Excel/CSV conversion can strip leading SKU zeros. Review original cells before relying on hints.',
    ],
  }
}
