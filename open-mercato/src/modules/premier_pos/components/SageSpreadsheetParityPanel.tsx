'use client'

import { useMemo, useState } from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  analyzeSageSpreadsheetParity, parseSageProductsCsv,
  type SageSpreadsheetProduct,
} from '../../../lib/premieros/sage-excel-parity'
import type { SageCatalogCandidate } from '../../../lib/premieros/sage-catalog-bridge'

type Props = {
  source: readonly SageCatalogCandidate[]
  completeSource: boolean
  hasLoadedSource: boolean
}
const MAX_BYTES = 5_000_000

/** Local-only spreadsheet preview: a SKU overlap is never an import mapping. */
export function SageSpreadsheetParityPanel({ source, completeSource, hasLoadedSource }: Props) {
  const t = useT()
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<readonly SageSpreadsheetProduct[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const report = useMemo(() =>
    rows !== null && hasLoadedSource
      ? analyzeSageSpreadsheetParity({ source, spreadsheet: rows, completeSource })
      : null,
  [rows, source, completeSource, hasLoadedSource])

  async function acceptFile(file: File | undefined) {
    setFileName('')
    setRows(null)
    setError('')
    if (!file) return
    if (!/\.csv$/i.test(file.name)) {
      setError(t('premier_pos.sageCsvErrorFormat'))
      return
    }
    if (file.size > MAX_BYTES) {
      setError(t('premier_pos.sageCsvErrorSize'))
      return
    }
    setLoading(true)
    try {
      const parsed = parseSageProductsCsv(await file.text())
      setRows(parsed)
      setFileName(file.name)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('premier_pos.sageCsvErrorFormat'))
    } finally {
      setLoading(false)
    }
  }

  function exportReport() {
    if (!report || !hasLoadedSource) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = 'sage-spreadsheet-sku-comparison-readonly.json'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }

  const statusLabels = Object.keys(report?.statuses ?? {})
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" aria-label={t('premier_pos.sageCsvTitle')}>
      <h2 className="font-semibold">{t('premier_pos.sageCsvTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('premier_pos.sageCsvInstructions')}</p>
      <p className="rounded-md border p-3 text-sm">{t('premier_pos.sageCsvWarning')}</p>
      <label className="block text-sm">
        {t('premier_pos.sageCsvChoose')}
        <input type="file" accept=".csv,text/csv" className="mt-2 block w-full text-sm"
          onChange={event => void acceptFile(event.target.files?.[0])}/>
      </label>
      {loading ? <p role="status" className="text-sm">{t('premier_pos.loading')}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {rows !== null ? <p role="status" className="text-sm">
        {fileName} — {rows.length} {t('premier_pos.sageCsvProducts')}
      </p> : null}
      {rows !== null && !hasLoadedSource ? <p className="text-sm">{t('premier_pos.sageCsvLoadSource')}</p> : null}
      {report ? (
        <div className="space-y-3">
          <p className="font-semibold">{t('premier_pos.sageCsvResult')}</p>
          <p className="text-xs text-muted-foreground">
            {report.completeSource ? t('premier_pos.parityFullSource') : t('premier_pos.parityPartialSource')}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {statusLabels.map(status => (
              <div key={status} className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{t(`premier_pos.sageCsvStatus.${status}`)}</div>
                <div className="text-lg font-semibold">
                  {report.statuses[status as keyof typeof report.statuses]}
                </div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b">
                <th className="p-2 text-start">SKU</th>
                <th className="p-2 text-start">{t('premier_pos.parityItem')}</th>
                <th className="p-2 text-start">{t('premier_pos.parityStatusTitle')}</th>
                <th className="p-2 text-start">{t('premier_pos.sageCsvRow')}</th>
              </tr></thead>
              <tbody>
                {report.rows.slice(0, 200).map((row, index) => (
                  <tr key={`${row.openMercatoProductId}:${row.openMercatoVariantId ?? index}`} className="border-b">
                    <td className="p-2 font-mono text-xs">{row.sku ?? '—'}</td>
                    <td className="p-2">{row.title}</td>
                    <td className="p-2">{t(`premier_pos.sageCsvStatus.${row.status}`)}</td>
                    <td className="p-2">{row.spreadsheetRow ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.rows.length > 200 ?
            <p className="text-xs text-muted-foreground">{t('premier_pos.parityTableLimit')}</p> : null}
          <Button variant="outline" type="button" onClick={exportReport}>
            {t('premier_pos.sageCsvDownload')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('premier_pos.sageCsvReportWarning')}</p>
        </div>
      ) : null}
    </section>
  )
}
