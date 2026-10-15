'use client'

import { useMemo, useState } from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  buildSageIdentityAudit, parseSageIdentityCsv, parseSageIdentityJson,
  SAGE_IDENTITY_EXPORT_SQL, type SageIdentityProduct,
} from '../../../lib/premieros/sage-identity-readiness'

const MAX_FILE_BYTES = 5_000_000

/**
 * First-class Sage-origin audit. This remains useful even when Open Mercato
 * has no catalog records. Source file never leaves the browser.
 */
export function SageIdentityReadinessPanel() {
  const t = useT()
  const [rows, setRows] = useState<readonly SageIdentityProduct[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [working, setWorking] = useState(false)
  const audit = useMemo(() => rows === null ? null : buildSageIdentityAudit(rows), [rows])

  async function loadFile(file: File | undefined) {
    setRows(null)
    setFileName('')
    setError('')
    setNotice('')
    if (!file) return
    if (!/\.(json|csv)$/i.test(file.name)) {
      setError(t('premier_pos.sageIdentityFileTypeError'))
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(t('premier_pos.sageIdentityFileSizeError'))
      return
    }
    setWorking(true)
    try {
      const raw = await file.text()
      const parsed = /\.csv$/i.test(file.name)
        ? parseSageIdentityCsv(raw)
        : parseSageIdentityJson(JSON.parse(raw) as unknown)
      setRows(parsed)
      setFileName(file.name)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('premier_pos.sageIdentityInvalid'))
    } finally {
      setWorking(false)
    }
  }
  async function copySql() {
    try {
      await navigator.clipboard.writeText(SAGE_IDENTITY_EXPORT_SQL)
      setNotice(t('premier_pos.sageIdentitySqlCopied'))
    } catch {
      setNotice(t('premier_pos.sageIdentitySqlCopyFailed'))
    }
  }
  function downloadAudit() {
    if (!audit) return
    const blob = new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' })
    const link = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = link
    anchor.download = 'premieros-sage-identity-readiness-readonly.json'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(link), 1000)
  }
  const stats: Array<{ key: string; value: number }> = audit ? [
    { key: 'total', value: audit.total },
    { key: 'manufactured', value: audit.manufactured },
    { key: 'ready', value: audit.ready },
    { key: 'missingSku', value: audit.missingSku },
    { key: 'inactive', value: audit.inactive },
    { key: 'duplicateNameWithinBranchGroups', value: audit.duplicateNameWithinBranchGroups },
  ] : []
  return <section className="space-y-4 rounded-xl border bg-card p-4"
    aria-label={t('premier_pos.sageIdentityTitle')}>
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">{t('premier_pos.sageIdentityTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('premier_pos.sageIdentityDescription')}</p>
    </header>
    <p className="rounded-md border p-3 text-sm">{t('premier_pos.sageIdentityCaution')}</p>
    <div className="space-y-2">
      <p className="text-sm font-semibold">{t('premier_pos.sageIdentityExportHelp')}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border bg-background p-3 font-mono text-xs"
        dir="ltr">{SAGE_IDENTITY_EXPORT_SQL}</pre>
      <Button type="button" size="sm" variant="outline" onClick={() => void copySql()}>
        {t('premier_pos.sageIdentityCopySql')}
      </Button>
      {notice ? <p role="status" className="text-sm">{notice}</p> : null}
    </div>
    <label className="block text-sm">{t('premier_pos.sageIdentityChoose')}
      <input type="file" accept=".json,.csv,application/json,text/csv" className="mt-2 block w-full text-sm"
        onChange={event => void loadFile(event.target.files?.[0])}/>
    </label>
    {working ? <p role="status">{t('premier_pos.loading')}</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {audit ? <div className="space-y-4">
      <p role="status" className="text-sm">{fileName} — {t('premier_pos.sageIdentityLocalOnly')}</p>
      <div className="grid gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {stats.map(item => <div className="rounded-lg border p-3" key={item.key}>
          <p className="text-xs text-muted-foreground">{t(`premier_pos.sageIdentity.${item.key}`)}</p>
          <p className="text-xl font-semibold tabular-nums">{item.value}</p>
        </div>)}
      </div>
      <h3 className="font-semibold">{t('premier_pos.sageIdentityBranchTitle')}</h3>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b">
          <th className="p-2 text-start">{t('premier_pos.sageIdentityBranchId')}</th>
          <th className="p-2 text-end">{t('premier_pos.sageIdentity.total')}</th>
          <th className="p-2 text-end">{t('premier_pos.sageIdentity.manufactured')}</th>
          <th className="p-2 text-end">{t('premier_pos.sageIdentity.ready')}</th>
          <th className="p-2 text-end">{t('premier_pos.sageIdentity.missingSku')}</th>
          <th className="p-2 text-end">{t('premier_pos.sageIdentity.inactive')}</th>
        </tr></thead>
        <tbody>{audit.branches.map(branch => <tr className="border-b" key={branch.branchId}>
          <td className="p-2 font-mono text-xs">{branch.branchId}</td>
          <td className="p-2 text-end tabular-nums">{branch.total}</td>
          <td className="p-2 text-end tabular-nums">{branch.manufactured}</td>
          <td className="p-2 text-end tabular-nums">{branch.ready}</td>
          <td className="p-2 text-end tabular-nums">{branch.missingSku}</td>
          <td className="p-2 text-end tabular-nums">{branch.inactive}</td>
        </tr>)}</tbody>
      </table></div>
      {audit.unknownActivity ? <p className="text-sm text-muted-foreground">
        {t('premier_pos.sageIdentityUnknownActivity')}: {audit.unknownActivity}
      </p> : null}
      <p className="text-sm font-semibold">{t('premier_pos.sageIdentityNotReady')}</p>
      <Button type="button" variant="outline" onClick={downloadAudit}>
        {t('premier_pos.sageIdentityDownload')}
      </Button>
      <p className="text-xs text-muted-foreground">{t('premier_pos.sageIdentityReportPrivacy')}</p>
    </div> : null}
  </section>
}
