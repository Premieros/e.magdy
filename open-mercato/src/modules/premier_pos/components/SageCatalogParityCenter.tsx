'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useOrganizationScopeDetail } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { getCurrentOrganizationScope } from '@open-mercato/shared/lib/frontend/organizationEvents'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  analyzeSageCatalogParity, parseCatalogPage, parseLocalSageProducts,
  type SageLocalProduct,
} from '../../../lib/premieros/sage-catalog-parity'
import type {
  SageCatalogCandidate, SageCatalogPreview,
} from '../../../lib/premieros/sage-catalog-bridge'
import { SageSpreadsheetParityPanel } from './SageSpreadsheetParityPanel'
import { SageIdentityReadinessPanel } from './SageIdentityReadinessPanel'

const MAX_LOCAL_FILE_BYTES = 5_000_000
const PAGE_SIZE = 50
const MAX_PAGES = 10

export function SageCatalogParityCenter({ userId }: { userId: string }) {
  const scope = useOrganizationScopeDetail()
  return <ScopedSageParity
    key={`${userId}:${scope.tenantId}:${scope.organizationId}`}
    tenantId={scope.tenantId} organizationId={scope.organizationId}
  />
}

function ScopedSageParity({ tenantId, organizationId }: {
  tenantId: string | null; organizationId: string | null
}) {
  const t = useT()
  const busy = useRef(false)
  const [loading, setLoading] = useState(false)
  const [hasLoadedSource, setHasLoadedSource] = useState(false)
  const [source, setSource] = useState<readonly SageCatalogCandidate[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const [sage, setSage] = useState<readonly SageLocalProduct[] | null>(null)
  const [error, setError] = useState('')
  const [localError, setLocalError] = useState('')
  const [fileName, setFileName] = useState('')
  const enabled = Boolean(tenantId && organizationId)
  const complete = hasLoadedSource && !nextCursor
  const report = sage && hasLoadedSource
    ? analyzeSageCatalogParity({ source, sage, completeSource: complete })
    : null

  function assertScope() {
    const current = getCurrentOrganizationScope()
    if (!tenantId || !organizationId ||
      current.tenantId !== tenantId || current.organizationId !== organizationId) {
      throw new Error('Organization changed; reload before comparing any records')
    }
  }

  async function loadPage() {
    if (!enabled || busy.current || cursorHistory.length >= MAX_PAGES ||
        (hasLoadedSource && !nextCursor)) return
    busy.current = true
    setLoading(true)
    setError('')
    try {
      assertScope()
      const cursor = hasLoadedSource ? nextCursor : null
      const query = new URLSearchParams({ pageSize: String(PAGE_SIZE) })
      if (cursor) query.set('cursor', cursor)
      const res = await apiCall<SageCatalogPreview>(
        `/api/premier_pos/sage-catalog-preview?${query.toString()}`,
        { method: 'GET', cache: 'no-store' },
      )
      if (!res.ok || !res.result) throw new Error('The official catalog preview could not be read')
      const page = parseCatalogPage(res.result, tenantId!, organizationId!)
      assertScope()
      if (page.nextCursor &&
          (page.nextCursor === cursor || cursorHistory.includes(page.nextCursor))) {
        throw new Error('Repeated catalog cursor; paging stopped to prevent duplicate results')
      }
      const newHistory = [...cursorHistory, cursor ?? 'first']
      if (newHistory.length > MAX_PAGES) throw new Error('Catalog page limit exceeded')
      const newSource = [...source, ...page.rows]
      const ids = new Set<string>()
      for (const row of newSource) {
        const id = `${row.openMercatoProductId}/${row.openMercatoVariantId ?? ''}`
        if (ids.has(id)) throw new Error('Duplicate source identity across catalog pages')
        ids.add(id)
      }
      setCursorHistory(newHistory)
      setSource(newSource)
      setNextCursor(page.nextCursor)
      setHasLoadedSource(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Catalog read failed')
    } finally {
      busy.current = false
      setLoading(false)
    }
  }

  async function loadLocalFile(file: File | undefined) {
    setLocalError('')
    setSage(null)
    setFileName('')
    if (!file) return
    if (file.size > MAX_LOCAL_FILE_BYTES) {
      setLocalError('File exceeds 5 MB local preview limit')
      return
    }
    try {
      const rows = parseLocalSageProducts(JSON.parse(await file.text()) as unknown)
      setSage(rows)
      setFileName(file.name)
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : 'Invalid local Sage JSON')
    }
  }

  const entries = report?.rows.slice(0, 200) ?? []
  return <section className="mx-auto max-w-7xl space-y-4 p-3" aria-label={t('premier_pos.parityTitle')}>
    <header className="flex flex-wrap justify-between gap-2">
      <div>
        <h1 className="text-xl font-semibold">{t('premier_pos.parityTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('premier_pos.parityDescription')}</p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link className="rounded-md border px-3 py-2 underline" href="/backend/pos/setup">{t('premier_pos.setupTitle')}</Link>
        <Link className="rounded-md border px-3 py-2 underline" href="/backend/catalog/products">{t('premier_pos.manageProducts')}</Link>
      </div>
    </header>
    <p className="rounded-md border p-3 text-sm">{t('premier_pos.parityPrivacy')}</p>
    <SageIdentityReadinessPanel />
    {!enabled ? <p role="alert">{t('premier_pos.scopeRequired')}</p> : null}
    <div className="grid gap-4 md:grid-cols-2">
      <article className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">{t('premier_pos.paritySource')}</h2>
        <p className="text-sm text-muted-foreground">{t('premier_pos.paritySourceHelp')}</p>
        <p className="text-sm">{t('premier_pos.paritySourceRows')}: <strong>{source.length}</strong></p>
        <p className="text-xs text-muted-foreground">
          {complete ? t('premier_pos.parityFullSource') : t('premier_pos.parityPartialSource')}
        </p>
        <Button type="button" disabled={!enabled || loading || cursorHistory.length >= MAX_PAGES ||
          (hasLoadedSource && !nextCursor)} onClick={() => void loadPage()}>
          {loading ? t('premier_pos.loading') : t('premier_pos.parityLoadMore')}
        </Button>
        {cursorHistory.length >= MAX_PAGES && nextCursor
          ? <p role="status" className="text-xs">{t('premier_pos.parityPageCap')}</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </article>
      <article className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">{t('premier_pos.paritySageFile')}</h2>
        <p className="text-sm text-muted-foreground">{t('premier_pos.parityFileHelp')}</p>
        <label className="block text-sm">
          {t('premier_pos.paritySelectFile')}
          <input type="file" accept=".json,application/json" className="mt-2 block w-full text-sm"
            onChange={event => void loadLocalFile(event.target.files?.[0])}/>
        </label>
        {fileName ? <p role="status" className="text-sm">
          {fileName} — {sage?.length ?? 0} {t('premier_pos.parityProducts')}
        </p> : null}
        {localError ? <p role="alert" className="text-sm text-destructive">{localError}</p> : null}
      </article>
    </div>
    <SageSpreadsheetParityPanel source={source} completeSource={complete} hasLoadedSource={hasLoadedSource} />
    {report ? <article className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <h2 className="font-semibold">{t('premier_pos.parityResult')}</h2>
        <p className="text-sm text-muted-foreground">{t('premier_pos.parityResultDisclaimer')}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Object.entries(report.statuses).map(([status, amount]) =>
          <div className="rounded-md border p-2" key={status}>
            <p className="text-xs text-muted-foreground">{t(`premier_pos.parityStatus.${status}`)}</p>
            <p className="text-lg font-semibold">{amount}</p>
          </div>)}
      </div>
      <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
        {[
          ...(report.completeSource ? [] : ['incomplete']),
          'match', 'branch', 'finance',
        ].map(code => <li key={code}>{t(`premier_pos.parityWarning.${code}`)}</li>)}
      </ul>
      {entries.length === 0 ? <p className="text-sm">{t('premier_pos.parityNoRows')}</p> :
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b">
            <th className="p-2 text-start">SKU</th>
            <th className="p-2 text-start">{t('premier_pos.parityItem')}</th>
            <th className="p-2 text-start">{t('premier_pos.parityStatusTitle')}</th>
            <th className="p-2 text-start">{t('premier_pos.parityBranch')}</th>
          </tr></thead>
          <tbody>{entries.map((row, index) =>
            <tr key={`${row.productId}:${row.variantId ?? index}`} className="border-b">
              <td className="p-2 font-mono text-xs">{row.sku ?? '—'}</td>
              <td className="p-2">{row.title}</td>
              <td className="p-2">{t(`premier_pos.parityStatus.${row.status}`)}</td>
              <td className="p-2 font-mono text-xs">{row.sageBranchId ?? '—'}</td>
            </tr>)}</tbody>
        </table></div>}
      {report.rows.length > 200 ? <p className="text-xs text-muted-foreground">
        {t('premier_pos.parityTableLimit')}
      </p> : null}
    </article> : <p className="rounded-lg border p-4 text-sm text-muted-foreground">
      {t('premier_pos.parityInstructions')}
    </p>}
  </section>
}
