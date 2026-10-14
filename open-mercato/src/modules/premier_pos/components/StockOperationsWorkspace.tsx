'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeDetail } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { getCurrentOrganizationScope } from '@open-mercato/shared/lib/frontend/organizationEvents'
import {
  buildStockCommand, matchingStockMovements, stockField, stockQuantity,
  stockRowsForScope, stockRowsForWarehouse, STOCK_OPERATIONS,
  type StockContext, type StockDraft, type StockOperation, type StockRow, type StockScope,
} from '../lib/stock-operations'

type Prepared = { referenceId: string; operation: StockOperation; draft: StockDraft; path: string; body: Record<string, unknown> }
type Outcome = { movementId: string | null; adjustmentDelta?: string; referenceId: string }
const starter: StockDraft = {
  operation: 'receive', warehouseId: '', locationId: '', toLocationId: '',
  catalogVariantId: '', quantity: '1', reason: '', lotNumber: '', serialNumber: '',
}

const friendly = (row: StockRow, ...fields: string[]) => {
  for (const field of fields) {
    const value = stockField(row, field)
    if (typeof value === 'string' && value.trim()) return value
  }
  return '—'
}
const inputClass = 'mt-1 w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm'
const labelClass = 'block text-sm'

export function StockOperationsWorkspace({ userId }: { userId: string }) {
  const detail = useOrganizationScopeDetail()
  return <ScopedStockOperations
    key={`${userId}:${detail.tenantId}:${detail.organizationId}`}
    userId={userId} tenantId={detail.tenantId} organizationId={detail.organizationId}
  />
}

function ScopedStockOperations({ userId, tenantId, organizationId }: {
  userId: string; tenantId: string | null; organizationId: string | null
}) {
  const t = useT()
  const [draft, setDraft] = useState<StockDraft>(starter)
  const [searchTerm, setSearchTerm] = useState('')
  const [search, setSearch] = useState('')
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const [reconciliation, setReconciliation] = useState<'none' | 'found' | 'not-found' | 'unavailable'>('none')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const enabled = Boolean(tenantId && organizationId && userId)
  const scope: StockScope = useMemo(() => ({
    tenantId: tenantId ?? '', organizationId: organizationId ?? '', performedBy: userId,
  }), [tenantId, organizationId, userId])
  const keys = ['premier-pos-stock-operations', userId, tenantId, organizationId]
  const warehouses = useQuery({
    queryKey: [...keys, 'warehouses'], enabled, retry: false, staleTime: 15000,
    queryFn: ({ signal }) => fetchCrudList<StockRow>('wms/warehouses',
      { pageSize: 100, isActive: true }, { signal }),
  })
  const availableWarehouses = enabled ? stockRowsForScope(warehouses.data?.items ?? [], scope) : []
  const locations = useQuery({
    queryKey: [...keys, 'locations', draft.warehouseId], enabled: enabled && Boolean(draft.warehouseId),
    retry: false, staleTime: 15000,
    queryFn: ({ signal }) => fetchCrudList<StockRow>('wms/locations',
      { pageSize: 100, warehouseId: draft.warehouseId, isActive: true }, { signal }),
  })
  const availableLocations = enabled
    ? stockRowsForWarehouse(locations.data?.items ?? [], scope, draft.warehouseId) : []
  const variants = useQuery({
    queryKey: [...keys, 'variants', search], enabled, retry: false, staleTime: 15000,
    queryFn: ({ signal }) => fetchCrudList<StockRow>('catalog/variants',
      { pageSize: 100, search: search || undefined, isActive: true }, { signal }),
  })
  const availableVariants = enabled ? stockRowsForScope(variants.data?.items ?? [], scope) : []
  const balances = useQuery({
    queryKey: [...keys, 'balances', draft.warehouseId, draft.catalogVariantId],
    enabled: enabled && Boolean(draft.warehouseId && draft.catalogVariantId),
    retry: false, staleTime: 0,
    queryFn: ({ signal }) => fetchCrudList<StockRow>('wms/inventory/balances',
      { pageSize: 100, warehouseId: draft.warehouseId,
        catalogVariantId: draft.catalogVariantId }, { signal }),
  })
  const movements = useQuery({
    queryKey: [...keys, 'movements', draft.warehouseId, draft.catalogVariantId],
    enabled: enabled && Boolean(draft.warehouseId && draft.catalogVariantId),
    retry: false, staleTime: 0,
    queryFn: ({ signal }) => fetchCrudList<StockRow>('wms/inventory/movements',
      { pageSize: 50, warehouseId: draft.warehouseId,
        catalogVariantId: draft.catalogVariantId }, { signal }),
  })
  const context: StockContext = {
    warehouses: warehouses.data?.items ?? [],
    locations: locations.data?.items ?? [],
    variants: variants.data?.items ?? [],
  }
  const locked = busy || uncertain || outcome !== null
  const canPrepare = enabled && !locked && Boolean(
    warehouses.data && locations.data && variants.data &&
    !warehouses.isFetching && !locations.isFetching && !variants.isFetching &&
    !warehouses.isError && !locations.isError && !variants.isError,
  )

  function edit<K extends keyof StockDraft>(field: K, value: StockDraft[K]) {
    if (locked) return
    setDraft(current => {
      if (field === 'warehouseId') return {
        ...current, warehouseId: String(value), locationId: '', toLocationId: '',
      }
      if (field === 'operation') return {
        ...current, operation: value as StockOperation,
        toLocationId: '', quantity: value === 'cycleCount' ? '0' : '1',
      }
      return { ...current, [field]: value }
    })
    setPrepared(null)
    setMessage('')
  }

  function prepare() {
    if (!canPrepare) return
    setMessage('')
    try {
      const referenceId = crypto.randomUUID()
      const command = buildStockCommand(draft, scope, referenceId, context)
      setPrepared({ referenceId, operation: draft.operation,
        draft: { ...draft }, path: command.path, body: command.body })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Invalid stock command')
    }
  }

  function assertCurrentScope() {
    const current = getCurrentOrganizationScope()
    if (current.tenantId !== scope.tenantId || current.organizationId !== scope.organizationId) {
      throw new Error('Selected organization changed; reload this screen')
    }
  }

  async function execute() {
    if (!prepared || inFlight.current || locked) return
    inFlight.current = true
    setBusy(true)
    setMessage('')
    try {
      assertCurrentScope()
      // Native WMS has the authoritative stock/lot, reservation and scope rules.
      const command = buildStockCommand(prepared.draft, scope, prepared.referenceId, context)
      if (JSON.stringify(command.body) !== JSON.stringify(prepared.body) ||
        command.path !== prepared.path) throw new Error('Review expired; refresh and review again')
      const result = await apiCall<{
        ok?: boolean; movementId?: string | null; adjustmentDelta?: string
      }>(prepared.path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prepared.body),
      })
      if (!result.ok || result.result?.ok !== true ||
          (prepared.operation !== 'cycleCount' && typeof result.result?.movementId !== 'string')) {
        throw new Error('WMS did not confirm the operation. Reconcile its reference before starting another.')
      }
      assertCurrentScope()
      setOutcome({ movementId: result.result.movementId ?? null,
        adjustmentDelta: result.result.adjustmentDelta, referenceId: prepared.referenceId })
      void balances.refetch()
      void movements.refetch()
    } catch (error) {
      // A connection failure may happen after the server committed the ledger entry.
      // Never submit another movement automatically.
      setUncertain(true)
      setMessage(error instanceof Error ? error.message : 'WMS outcome unknown')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function reconcile() {
    if (!prepared || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setReconciliation('none')
    try {
      const response = await fetchCrudList<StockRow>('wms/inventory/movements', {
        pageSize: 100, referenceType: 'manual', referenceId: prepared.referenceId,
      })
      const found = matchingStockMovements(response.items, scope,
        prepared.referenceId, prepared.draft)
      setReconciliation(found.length > 0 ? 'found' : 'not-found')
      void balances.refetch()
      void movements.refetch()
    } catch {
      setReconciliation('unavailable')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  function newOperation() {
    if (busy) return
    setPrepared(null)
    setOutcome(null)
    setUncertain(false)
    setReconciliation('none')
    setMessage('')
    setDraft(previous => ({ ...previous, quantity: '1', reason: '', lotNumber: '', serialNumber: '' }))
    void balances.refetch()
    void movements.refetch()
  }

  function refreshLists() {
    if (busy) return
    void warehouses.refetch()
    if (draft.warehouseId) void locations.refetch()
    void variants.refetch()
    if (draft.warehouseId && draft.catalogVariantId) {
      void balances.refetch()
      void movements.refetch()
    }
  }

  return <section className="mx-auto w-full max-w-7xl space-y-4 p-3" aria-label={t('premier_pos.stockTitle')}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{t('premier_pos.stockTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('premier_pos.stockDescription')}</p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Button variant="outline" disabled={busy} onClick={refreshLists}>{t('premier_pos.traceRefresh')}</Button>
        <Link className="rounded-md border px-3 py-2 underline" href="/backend/pos">{t('premier_pos.title')}</Link>
        <Link className="rounded-md border px-3 py-2 underline" href="/backend/wms/inventory">{t('premier_pos.inventory')}</Link>
        <Link className="rounded-md border px-3 py-2 underline" href="/backend/pos/setup">{t('premier_pos.setupTitle')}</Link>
      </div>
    </header>
    <p className="rounded-lg border bg-card p-3 text-sm">{t('premier_pos.stockWarning')}</p>
    {!enabled ? <p role="alert">{t('premier_pos.scopeRequired')}</p> : null}
    {(warehouses.isError || variants.isError || (draft.warehouseId && locations.isError))
      ? <p role="alert" className="rounded-md border p-3">{t('premier_pos.stockDataError')}</p> : null}
    <div className="grid gap-4 lg:grid-cols-[minmax(300px,1fr)_minmax(0,1fr)]">
      <article className="space-y-4 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">{t('premier_pos.stockNewAction')}</h2>
        <div className="grid grid-cols-2 gap-2">
          {STOCK_OPERATIONS.map(operation =>
            <Button key={operation} type="button"
              variant={draft.operation === operation ? 'default' : 'outline'}
              disabled={locked} onClick={() => edit('operation', operation)}>
              {t(`premier_pos.stock.${operation}`)}
            </Button>)}
        </div>
        <label className={labelClass}>{t('premier_pos.stockWarehouse')}
          <select className={inputClass} value={draft.warehouseId} disabled={locked}
            onChange={event => edit('warehouseId', event.target.value)}>
            <option value="">{t('premier_pos.stockChoose')}</option>
            {availableWarehouses.map(row => <option key={String(row.id)} value={String(row.id)}>
              {friendly(row, 'name', 'code')}
            </option>)}
          </select>
        </label>
        <label className={labelClass}>{t('premier_pos.stockFindVariant')}
          <div className="mt-1 flex gap-2">
            <input className="min-w-0 flex-1 rounded-md border bg-background p-2"
              value={searchTerm} disabled={locked} onChange={event => setSearchTerm(event.target.value)}
              placeholder="SKU"
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setSearch(searchTerm.trim()) } }}/>
            <Button type="button" variant="outline" disabled={locked}
              onClick={() => setSearch(searchTerm.trim())}>{t('premier_pos.search')}</Button>
          </div>
        </label>
        <label className={labelClass}>{t('premier_pos.stockVariant')}
          <select className={inputClass} value={draft.catalogVariantId} disabled={locked}
            onChange={event => edit('catalogVariantId', event.target.value)}>
            <option value="">{t('premier_pos.stockChoose')}</option>
            {availableVariants.map(row => <option key={String(row.id)} value={String(row.id)}>
              {friendly(row, 'sku', 'name')}
            </option>)}
          </select>
        </label>
        <label className={labelClass}>{draft.operation === 'move'
          ? t('premier_pos.stockFromLocation') : t('premier_pos.stockLocation')}
          <select className={inputClass} value={draft.locationId} disabled={locked}
            onChange={event => edit('locationId', event.target.value)}>
            <option value="">{t('premier_pos.stockChoose')}</option>
            {availableLocations.map(row => <option key={String(row.id)} value={String(row.id)}>
              {friendly(row, 'code', 'type')}
            </option>)}
          </select>
        </label>
        {draft.operation === 'move' ? <label className={labelClass}>{t('premier_pos.stockToLocation')}
          <select className={inputClass} value={draft.toLocationId} disabled={locked}
            onChange={event => edit('toLocationId', event.target.value)}>
            <option value="">{t('premier_pos.stockChoose')}</option>
            {availableLocations.filter(row => row.id !== draft.locationId).map(row =>
              <option key={String(row.id)} value={String(row.id)}>
                {friendly(row, 'code', 'type')}
              </option>)}
          </select>
        </label> : null}
        <label className={labelClass}>{draft.operation === 'adjust'
          ? t('premier_pos.stockDelta') : draft.operation === 'cycleCount'
            ? t('premier_pos.stockCount') : t('premier_pos.stockQuantity')}
          <input className={inputClass} type="number" step="0.000001" value={draft.quantity}
            disabled={locked} onChange={event => edit('quantity', event.target.value)} />
        </label>
        {draft.operation === 'receive' ?
          <label className={labelClass}>{t('premier_pos.stockLotNumber')}
            <input className={inputClass} value={draft.lotNumber} disabled={locked}
              onChange={event => edit('lotNumber', event.target.value)} maxLength={120}/>
          </label> : null}
        <label className={labelClass}>{t('premier_pos.stockSerial')}
          <input className={inputClass} value={draft.serialNumber} disabled={locked}
            onChange={event => edit('serialNumber', event.target.value)} maxLength={120}/>
        </label>
        <label className={labelClass}>{t('premier_pos.stockReason')}
          <textarea className={inputClass} rows={2} maxLength={500} value={draft.reason}
            disabled={locked} onChange={event => edit('reason', event.target.value)}/>
        </label>
        {!prepared && !locked ? <Button type="button" disabled={!canPrepare} onClick={prepare}>
          {t('premier_pos.stockReview')}
        </Button> : null}
        {prepared ? <div className="space-y-3 rounded-lg border p-3">
          <h3 className="font-semibold">{t('premier_pos.stockReviewTitle')}</h3>
          <p className="text-sm">{t(`premier_pos.stock.${prepared.operation}`)} · {prepared.draft.quantity}</p>
          <p className="break-all font-mono text-xs">{t('premier_pos.stockReference')}: {prepared.referenceId}</p>
          <p className="text-xs text-muted-foreground">{t('premier_pos.stockReviewNote')}</p>
          {!locked ? <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void execute()} disabled={busy}>
              {t('premier_pos.stockConfirm')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setPrepared(null)}>
              {t('premier_pos.stockEdit')}
            </Button>
          </div> : null}
        </div> : null}
        {message ? <p role="alert" className="rounded-md border p-3 text-sm">{message}</p> : null}
        {outcome ? <div role="status" className="space-y-2 rounded-md border p-3 text-sm">
          <p className="font-semibold">{t('premier_pos.stockConfirmed')}</p>
          <p className="break-all">{t('premier_pos.stockMovement')}: {outcome.movementId ?? '—'}</p>
          {outcome.adjustmentDelta != null
            ? <p>{t('premier_pos.stockAdjustment')}: {outcome.adjustmentDelta}</p> : null}
          <p className="break-all">{t('premier_pos.stockReference')}: {outcome.referenceId}</p>
        </div> : null}
        {uncertain && prepared ? <div className="space-y-2 rounded-md border p-3 text-sm">
          <p className="font-semibold">{t('premier_pos.stockUnknown')}</p>
          <Button type="button" variant="outline" onClick={() => void reconcile()} disabled={busy}>
            {t('premier_pos.stockReconcile')}
          </Button>
          {reconciliation !== 'none' ? <p role="status">
            {t(`premier_pos.stockReconcile.${reconciliation}`)}
          </p> : null}
        </div> : null}
        {(outcome || uncertain) ? <Button type="button" variant="outline"
          onClick={newOperation} disabled={busy}>
          {t('premier_pos.stockNew')}
        </Button> : null}
      </article>
      <div className="space-y-4">
        <article className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold">{t('premier_pos.stockBalances')}</h2>
          {!draft.warehouseId || !draft.catalogVariantId
            ? <p className="mt-2 text-sm text-muted-foreground">{t('premier_pos.stockSelectFirst')}</p>
            : balances.isPending ? <p role="status">{t('premier_pos.loading')}</p>
            : balances.isError ? <p role="alert">{t('premier_pos.stockDataError')}</p>
            : balances.data.items.length === 0
              ? <p className="mt-2 text-sm">{t('premier_pos.stockNoBalances')}</p>
              : <div className="mt-2 overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="border-b text-start"><th className="p-2 text-start">{t('premier_pos.stockLocation')}</th>
                    <th className="p-2 text-end">{t('premier_pos.stockOnHand')}</th>
                    <th className="p-2 text-end">{t('premier_pos.stockReserved')}</th>
                    <th className="p-2 text-end">{t('premier_pos.stockAvailable')}</th></tr></thead>
                  <tbody>{balances.data.items.filter(row =>
                    stockField(row, 'warehouseId') === draft.warehouseId &&
                    stockField(row, 'catalogVariantId') === draft.catalogVariantId &&
                    stockRowsForScope([row], scope).length > 0)
                    .map((row, index) => <tr className="border-b" key={String(row.id ?? index)}>
                      <td className="p-2">{friendly(row, 'locationCode', 'locationId')}</td>
                      <td className="p-2 text-end">{stockQuantity(row, 'quantityOnHand') ?? '—'}</td>
                      <td className="p-2 text-end">{stockQuantity(row, 'quantityReserved') ?? '—'}</td>
                      <td className="p-2 text-end">{stockQuantity(row, 'quantityAvailable') ?? '—'}</td>
                    </tr>)}</tbody>
                </table></div>}
          <p className="mt-2 text-xs text-muted-foreground">{t('premier_pos.stockPagingNote')}</p>
        </article>
        <article className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold">{t('premier_pos.stockLedger')}</h2>
          {!draft.warehouseId || !draft.catalogVariantId
            ? <p className="mt-2 text-sm text-muted-foreground">{t('premier_pos.stockSelectFirst')}</p>
            : movements.isPending ? <p role="status">{t('premier_pos.loading')}</p>
            : movements.isError ? <p role="alert">{t('premier_pos.stockDataError')}</p>
            : movements.data.items.length === 0
              ? <p className="mt-2 text-sm">{t('premier_pos.stockNoMovements')}</p>
              : <ul className="mt-2 space-y-2 text-sm">{movements.data.items.filter(row =>
                  stockField(row, 'warehouseId') === draft.warehouseId &&
                  stockField(row, 'catalogVariantId') === draft.catalogVariantId &&
                  stockRowsForScope([row], scope).length > 0)
                .map((row, index) => <li className="rounded-md border p-2" key={String(row.id ?? index)}>
                  <div className="flex items-center justify-between gap-2">
                    <strong>{friendly(row, 'type')}</strong>
                    <span>{stockQuantity(row, 'quantity') ?? '—'}</span>
                  </div>
                  <p className="break-all text-xs text-muted-foreground">{friendly(row, 'referenceType')} · {friendly(row, 'referenceId')}</p>
                  <p className="text-xs text-muted-foreground">{friendly(row, 'performedAt', 'createdAt')}</p>
                </li>)}</ul>}
          <p className="mt-2 text-xs text-muted-foreground">{t('premier_pos.stockPagingNote')}</p>
        </article>
      </div>
    </div>
  </section>
}
