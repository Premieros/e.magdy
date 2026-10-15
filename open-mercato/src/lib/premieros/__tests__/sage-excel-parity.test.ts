import { describe, expect, it } from '@jest/globals'
import {
  analyzeSageSpreadsheetParity, parseSageProductsCsv,
  type SageSpreadsheetProduct,
} from '../sage-excel-parity'
import type { SageCatalogCandidate } from '../sage-catalog-bridge'

const candidate: SageCatalogCandidate = {
  openMercatoProductId: '11111111-1111-4111-8111-111111111111',
  openMercatoVariantId: '22222222-2222-4222-8222-222222222222',
  title: 'Cotton', suggestedSku: 'TEE-001',
  variantName: 'Small', barcode: '999', openMercatoProductType: 'simple',
  activeInSource: true, needsExplicitSageTypeMapping: true,
}
const example = 'Name,NameEn,Barcode,SKU,ProductType,CostPrice,SalePrice\r\n' +
  'Cotton,Cotton EN,123,TEE-001,ready,15,30\r\n' +
  '"Kitchen, special","quote ""x""",987,FOOD-2,manufactured,5,20\r\n'
const sheet = (sku: string, i: number): SageSpreadsheetProduct => ({
  spreadsheetRow: i, name: 'Name ' + i, sku, barcode: null, productType: 'ready',
})
describe('Sage legacy XLSX Save-As CSV read-only compatibility', () => {
  it('parses the exact columns from Sage existing Products export', () => {
    expect(parseSageProductsCsv(example)).toEqual([
      { spreadsheetRow: 2, name: 'Cotton', sku: 'TEE-001', productType: 'ready', barcode: '123' },
      { spreadsheetRow: 3, name: 'Kitchen, special', sku: 'FOOD-2', productType: 'manufactured', barcode: '987' },
    ])
  })
  it('supports BOM, quoted newlines, escaped quotes and semicolon spreadsheets', () => {
    const csv = '\uFEFFName;SKU;ProductType;Barcode\n' +
      '"Coffee\nwith milk";"001";manufactured;\n' +
      '"A ""quoted"" dish";B-1;ready;ABC\n'
    expect(parseSageProductsCsv(csv)).toEqual([
      { spreadsheetRow: 2, name: 'Coffee\nwith milk', sku: '001', productType: 'manufactured', barcode: null },
      { spreadsheetRow: 3, name: 'A "quoted" dish', sku: 'B-1', productType: 'ready', barcode: 'ABC' },
    ])
    expect(parseSageProductsCsv('Name\tSKU\tProductType\nTea\tT1\tready\n')).toHaveLength(1)
  })
  it('rejects unclosed CSV, duplicate headers, missing mandatory columns and bad values', () => {
    for (const input of [
      'Name,SKU,ProductType\n"broken,ABC,ready',
      'Name,Name,SKU,ProductType\nX,Y,Z,ready',
      'Name,SKU\nX,Z',
      'Name,SKU,ProductType\nX,Y,custom',
      'Name,SKU,ProductType\n,Y,ready',
      'Name,SKU,ProductType\nX,Y,ready,another',
      'Name,SKU,ProductType\n"X"bad,Y,ready',
    ]) expect(() => parseSageProductsCsv(input)).toThrow()
  })
  it('never fabricates stable Sage product IDs or branch identities from the spreadsheet', () => {
    const rows = parseSageProductsCsv(example)
    const report = analyzeSageSpreadsheetParity({ source: [candidate], spreadsheet: rows, completeSource: true })
    expect(report).toMatchObject({
      mode: 'sku-hints-only', readOnly: true, canImport: false,
      statuses: { 'sku-overlap-unverified': 1 },
      rows: [{ identityVerified: false, spreadsheetRow: 2, spreadsheetName: 'Cotton' }],
    })
    expect(report.rows[0]).not.toHaveProperty('sageProductId')
    expect(report.rows[0]).not.toHaveProperty('sageBranchId')
    expect(report.warnings.join(' ')).toMatch(/branch ID/)
  })
  it('treats repeated source SKU and spreadsheet SKU as conflicts, not one-to-one matches', () => {
    const s = [sheet('TEE-001', 2), sheet('tee-001', 3)]
    let report = analyzeSageSpreadsheetParity({ source: [candidate], spreadsheet: s, completeSource: true })
    expect(report.statuses['ambiguous-spreadsheet-sku']).toBe(1)
    expect(report.rows[0].spreadsheetRow).toBeNull()
    report = analyzeSageSpreadsheetParity({ source: [
      candidate, { ...candidate, openMercatoVariantId: null },
    ], spreadsheet: [s[0]], completeSource: true })
    expect(report.statuses['duplicate-source-sku']).toBe(2)
  })
  it('distinguishes unmatched and empty SKU and never infers source completeness', () => {
    const report = analyzeSageSpreadsheetParity({
      source: [candidate, { ...candidate,
        openMercatoVariantId: '33333333-3333-4333-8333-333333333333', suggestedSku: null }],
      spreadsheet: [sheet('other', 2)], completeSource: false,
    })
    expect(report.statuses['missing-source-sku']).toBe(1)
    expect(report.statuses['no-spreadsheet-match']).toBe(1)
    expect(report.completeSource).toBe(false)
    expect(report.canImport).toBe(false)
    expect(report.warnings.join(' ')).toMatch(/Incomplete/)
  })
  it('fails closed on repeated canonical identities and oversize CSV', () => {
    expect(() => analyzeSageSpreadsheetParity({
      source: [candidate, candidate], spreadsheet: [], completeSource: true,
    })).toThrow('Duplicate source')
    expect(() => parseSageProductsCsv('a'.repeat(5_000_001))).toThrow('5 MB')
  })
})
