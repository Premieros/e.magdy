'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeDetail } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { getCurrentOrganizationScope } from '@open-mercato/shared/lib/frontend/organizationEvents'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { NativeCatalogSetup } from './NativeCatalogSetup'
import {
  availableSetupRows, buildNativeSetupRequest, hasConfiguredSetup, setupRowField,
  type NativeSetupKind, type NativeSetupRow, type NativeSetupScope,
} from '../lib/native-setup'

const kinds: NativeSetupKind[] = ['currency', 'channel', 'paymentMethod', 'warehouse', 'location']
const links: Record<NativeSetupKind, string> = {
  currency: '/backend/currencies/currencies',
  channel: '/backend/sales/channels',
  paymentMethod: '/backend/config/sales',
  warehouse: '/backend/wms/warehouses',
  location: '/backend/wms/inventory',
}

export function NativeSetupWorkspace({ userId }: { userId: string }) {
  const scope = useOrganizationScopeDetail()
  // Never allow previous-organization progress or query state into a new org.
  return (
    <ScopedSetup
      key={`${userId}:${scope.tenantId}:${scope.organizationId}`}
      userId={userId}
      tenantId={scope.tenantId}
      organizationId={scope.organizationId}
    />
  )
}

function ScopedSetup({
  userId, tenantId, organizationId,
}: { userId: string; tenantId: string | null; organizationId: string | null }) {
  const t = useT()
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [busy, setBusy] = useState<NativeSetupKind | null>(null)
  const [lastCompleted, setLastCompleted] = useState<NativeSetupKind | null>(null)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const scope: NativeSetupScope = useMemo(
    () => ({ tenantId: tenantId ?? '', organizationId: organizationId ?? '' }),
    [tenantId, organizationId],
  )
  const enabled = Boolean(tenantId && organizationId)
  const cacheKey = ['premier-pos-native-setup', userId, tenantId, organizationId]

  const currencies = useQuery({
    queryKey: [...cacheKey, 'currency'], enabled, retry: false, staleTime: 0,
    queryFn: async ({ signal }): Promise<NativeSetupRow[]> => {
      const result = await apiCall<{ items?: Array<{ value: string; label: string }> }>(
        '/api/premier_pos/currency-options', { signal },
      )
      if (!result.ok || !result.result?.items) throw new Error('Currency lookup unavailable')
      return result.result.items.map((entry) => ({ code: entry.value, name: entry.label }))
    },
  })
  const channels = useQuery({
    queryKey: [...cacheKey, 'channel'], enabled, retry: false, staleTime: 0,
    queryFn: async ({ signal }) => (await fetchCrudList<NativeSetupRow>(
      'sales/channels', { pageSize: 100, isActive: true }, { signal },
    )).items,
  })
  const methods = useQuery({
    queryKey: [...cacheKey, 'paymentMethod'], enabled, retry: false, staleTime: 0,
    queryFn: async ({ signal }): Promise<NativeSetupRow[]> => {
      const result = await apiCall<{ items?: NativeSetupRow[] }>(
        '/api/premier_pos/payment-methods', { signal },
      )
      if (!result.ok || !result.result?.items) throw new Error('Payment methods unavailable')
      return result.result.items
    },
  })
  const warehouses = useQuery({
    queryKey: [...cacheKey, 'warehouse'], enabled, retry: false, staleTime: 0,
    queryFn: async ({ signal }) => (await fetchCrudList<NativeSetupRow>(
      'wms/warehouses', { pageSize: 100, isActive: true }, { signal },
    )).items,
  })
  const validWarehouses = enabled && warehouses.data
    ? availableSetupRows(warehouses.data, scope)
    : []
  const testWarehouse = validWarehouses.find(
    (row) => setupRowField(row, 'code') === 'DEV-TEST-WH',
  )
  const effectiveWarehouseId = selectedWarehouseId || (
    typeof testWarehouse?.id === 'string' ? testWarehouse.id : ''
  )
  const locations = useQuery({
    queryKey: [...cacheKey, 'location', effectiveWarehouseId],
    enabled: enabled && Boolean(effectiveWarehouseId), retry: false, staleTime: 0,
    queryFn: async ({ signal }) => (await fetchCrudList<NativeSetupRow>(
      'wms/locations', { pageSize: 100, warehouseId: effectiveWarehouseId, isActive: true },
      { signal },
    )).items,
  })

  const datasets = { currency: currencies, channel: channels, paymentMethod: methods, warehouse: warehouses, location: locations }
  const configured = (kind: NativeSetupKind) =>
    enabled && Boolean(datasets[kind].data) &&
    hasConfiguredSetup(kind, datasets[kind].data ?? [], scope, effectiveWarehouseId)

  async function createStep(kind: NativeSetupKind) {
    if (inFlight.current || !enabled || !datasets[kind].data || configured(kind)) return
    // Never silently create a physical location without a selected official warehouse.
    if (kind === 'location' && !effectiveWarehouseId) return
    inFlight.current = true
    setBusy(kind)
    setLastCompleted(null)
    setError('')
    try {
      const current = getCurrentOrganizationScope()
      if (current.tenantId !== scope.tenantId || current.organizationId !== scope.organizationId) {
        throw new Error('Organization changed; reload before continuing')
      }
      const fresh = await datasets[kind].refetch()
      if (!fresh.data || hasConfiguredSetup(kind, fresh.data, scope, effectiveWarehouseId)) {
        throw new Error('Configuration exists or cannot be verified; inspect native records')
      }
      const { path, body } = buildNativeSetupRequest(kind, scope, effectiveWarehouseId)
      const result = await apiCall<{ id?: string }>(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!result.ok || typeof result.result?.id !== 'string' || !result.result.id) {
        throw new Error('Official module rejected setup. Check the relevant configuration permission.')
      }
      const now = getCurrentOrganizationScope()
      if (now.tenantId !== scope.tenantId || now.organizationId !== scope.organizationId) {
        throw new Error('Organization changed while saving; inspect the native record before retrying')
      }
      if (kind === 'warehouse') setSelectedWarehouseId(result.result.id)
      setLastCompleted(kind)
      await datasets[kind].refetch()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Setup request failed')
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  const refreshAll = () => {
    if (!enabled || inFlight.current) return
    void currencies.refetch()
    void channels.refetch()
    void methods.refetch()
    void warehouses.refetch()
    if (effectiveWarehouseId) void locations.refetch()
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3" aria-label={t('premier_pos.setupTitle')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t('premier_pos.setupTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('premier_pos.setupDescription')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!enabled || busy !== null} onClick={refreshAll}>{t('premier_pos.traceRefresh')}</Button>
          <Link href="/backend/pos" className="rounded-md border px-3 py-2 text-sm underline">{t('premier_pos.title')}</Link>
        </div>
      </div>
      <p className="rounded-lg border bg-card p-3 text-sm">{t('premier_pos.setupCaution')}</p>
      {!enabled ? <p role="alert" className="rounded-lg border p-4">{t('premier_pos.scopeRequired')}</p> : (
        <>
          {error ? <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p> : null}
          {lastCompleted ? <p role="status" className="rounded-md border p-3 text-sm">{t('premier_pos.setupSaved')}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {kinds.map((kind) => {
              const query = datasets[kind]
              const ready = configured(kind)
              const isLoading = query.isPending || query.isFetching
              const inaccessible = query.isError
              const rows = query.data ? availableSetupRows(query.data, scope) : []
              const canCreate = !busy && !ready && !isLoading && !inaccessible &&
                query.data !== undefined && (kind !== 'location' || Boolean(effectiveWarehouseId))
              return (
                <article key={kind} className="rounded-lg border bg-card p-4">
                  <h2 className="font-semibold">{t(`premier_pos.setup.${kind}`)}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {inaccessible ? t('premier_pos.setupUnavailable') :
                      isLoading ? t('premier_pos.loading') :
                        ready ? t('premier_pos.setupReady') : t('premier_pos.setupMissing')}
                  </p>
                  {kind === 'warehouse' && validWarehouses.length > 0 ? (
                    <label className="my-3 block text-sm">
                      {t('premier_pos.setupSelectWarehouse')}
                      <select className="mt-1 w-full rounded border bg-background p-2" value={effectiveWarehouseId}
                        disabled={busy !== null} onChange={(event) => setSelectedWarehouseId(event.target.value)}>
                        <option value="">{t('premier_pos.setupSelectWarehouse')}</option>
                        {validWarehouses.map((w) => <option key={String(w.id)} value={String(w.id)}>
                          {String(setupRowField(w, 'name') ?? setupRowField(w, 'code') ?? w.id)}
                        </option>)}
                      </select>
                    </label>
                  ) : null}
                  {kind === 'location' && validWarehouses.length > 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">{t('premier_pos.setupWarehouseLocationHint')}</p>
                  ) : null}
                  {ready && rows.length ? (
                    <p className="mt-2 text-xs">{String(setupRowField(rows[0], 'name') ?? setupRowField(rows[0], 'code') ?? '')}</p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button type="button" disabled={!canCreate} onClick={() => void createStep(kind)}>
                      {busy === kind ? t('premier_pos.loading') : t(`premier_pos.setupCreate.${kind}`)}
                    </Button>
                    <Link href={links[kind]} className="text-sm underline">{t('premier_pos.setupManage')}</Link>
                  </div>
                </article>
              )
            })}
          </div>
          <NativeCatalogSetup userId={userId} scope={scope} />
          <section className="rounded-lg border bg-card p-4" aria-label={t('premier_pos.sageExportTitle')}>
            <h2 className="font-semibold">{t('premier_pos.sageExportTitle')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('premier_pos.sageExportWarning')}</p>
            <a href="/api/premier_pos/sage-catalog-preview?download=1&pageSize=50"
              className="mt-3 inline-flex rounded-md border px-3 py-2 text-sm underline">
              {t('premier_pos.sageExportDownload')}
            </a>
          </section>
          <p className="text-sm text-muted-foreground">{t('premier_pos.setupNext')}</p>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-md border px-3 py-2 text-sm underline" href="/backend/catalog/products">{t('premier_pos.manageProducts')}</Link>
            <Link className="rounded-md border px-3 py-2 text-sm underline" href="/backend/wms/inventory">{t('premier_pos.inventory')}</Link>
          <Link className="rounded-md border px-3 py-2 text-sm underline" href="/backend/pos/stock">{t('premier_pos.stockTitle')}</Link>
            <Link className="rounded-md border px-3 py-2 text-sm underline" href="/backend/pos/operations">{t('premier_pos.traceTitle')}</Link>
          </div>
        </>
      )}
    </section>
  )
}
