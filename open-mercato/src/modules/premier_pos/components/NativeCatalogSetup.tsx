'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { getCurrentOrganizationScope } from '@open-mercato/shared/lib/frontend/organizationEvents'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  CATALOG_SETUP_STAGES, CATALOG_STARTER, buildCatalogSetupRequest,
  matchingCatalogRows, validCatalogId, type NativeCatalogStage,
} from '../lib/native-catalog-setup'
import { type NativeSetupRow, type NativeSetupScope, setupRowField } from '../lib/native-setup'

function firstId(rows: NativeSetupRow[]): string {
  const id = rows[0]?.id
  return validCatalogId(id) ? id : ''
}

/**
 * Configures a native saleable sample, one explicit audited CRUD call per click.
 * The real sales, pricing and inventory modules retain all authorization.
 */
export function NativeCatalogSetup({ userId, scope }: {
  userId: string; scope: NativeSetupScope
}) {
  const t = useT()
  const inFlight = useRef(false)
  const [busy, setBusy] = useState<NativeCatalogStage | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<NativeCatalogStage | null>(null)
  const key = ['premier-pos-catalog-setup', userId, scope.tenantId, scope.organizationId]

  const currencyQuery = useQuery({
    queryKey: [...key, 'egp'], retry: false, staleTime: 0,
    queryFn: async ({ signal }) => {
      const result = await apiCall<{ items: Array<{ value: string }> }>(
        '/api/premier_pos/currency-options', { signal },
      )
      if (!result.ok || !Array.isArray(result.result?.items)) throw new Error('Currency lookup not available')
      return result.result.items
    },
  })
  const channelQuery = useQuery({
    queryKey: [...key, 'channel'], retry: false, staleTime: 0,
    queryFn: async ({ signal }) => (await fetchCrudList<NativeSetupRow>('sales/channels',
      { pageSize: 100, search: 'dev_test_pos', isActive: true }, { signal })).items,
  })
  const productQuery = useQuery({
    queryKey: [...key, 'product'], retry: false, staleTime: 0,
    queryFn: async ({ signal }) => (await fetchCrudList<NativeSetupRow>('catalog/products',
      { pageSize: 100, search: CATALOG_STARTER.productSku }, { signal })).items,
  })
  const priceKindQuery = useQuery({
    queryKey: [...key, 'priceKind'], retry: false, staleTime: 0,
    queryFn: async ({ signal }) => (await fetchCrudList<NativeSetupRow>('catalog/price-kinds',
      { pageSize: 100, search: CATALOG_STARTER.priceKindCode }, { signal })).items,
  })

  const channelRows = (channelQuery.data ?? []).filter(row =>
    setupRowField(row, 'code') === 'dev_test_pos' &&
    (setupRowField(row, 'tenantId') == null || setupRowField(row, 'tenantId') === scope.tenantId) &&
    (setupRowField(row, 'organizationId') == null ||
      setupRowField(row, 'organizationId') === scope.organizationId) &&
    setupRowField(row, 'isActive') !== false)
  const channelId = firstId(channelRows)
  const productId = firstId(matchingCatalogRows('product', productQuery.data ?? [], scope, {}))
  const priceKindId = firstId(matchingCatalogRows('priceKind', priceKindQuery.data ?? [], scope, {}))
  const idsBase = { product: productId, priceKind: priceKindId, channel: channelId }

  const variantQuery = useQuery({
    queryKey: [...key, 'variant', productId], enabled: Boolean(productId),
    retry: false, staleTime: 0,
    queryFn: async ({ signal }) => (await fetchCrudList<NativeSetupRow>('catalog/variants',
      { pageSize: 100, productId, sku: CATALOG_STARTER.variantSku }, { signal })).items,
  })
  const variantId = productId ? firstId(
    matchingCatalogRows('variant', variantQuery.data ?? [], scope, idsBase),
  ) : ''
  const offerQuery = useQuery({
    queryKey: [...key, 'offer', productId, channelId], enabled: Boolean(productId && channelId),
    retry: false, staleTime: 0,
    queryFn: async ({ signal }) => (await fetchCrudList<NativeSetupRow>('catalog/offers',
      { pageSize: 100, productId, channelId }, { signal })).items,
  })
  const offerId = productId && channelId ? firstId(
    matchingCatalogRows('offer', offerQuery.data ?? [], scope, idsBase),
  ) : ''
  const ids = { ...idsBase, variant: variantId, offer: offerId }
  const priceQuery = useQuery({
    queryKey: [...key, 'price', productId, variantId, priceKindId, offerId, channelId],
    enabled: Boolean(productId && variantId && priceKindId && offerId && channelId),
    retry: false, staleTime: 0,
    queryFn: async ({ signal }) => (await fetchCrudList<NativeSetupRow>('catalog/prices', {
      pageSize: 100, productId, variantId, offerId, priceKindId,
      channelId, currencyCode: CATALOG_STARTER.currencyCode,
    }, { signal })).items,
  })

  const queries = { product: productQuery, variant: variantQuery, priceKind: priceKindQuery,
    offer: offerQuery, price: priceQuery }
  const rowsFor = (stage: NativeCatalogStage) => matchingCatalogRows(
    stage, queries[stage].data ?? [], scope, ids,
  )
  const ready = (stage: NativeCatalogStage) => Boolean(queries[stage].data) &&
    rowsFor(stage).length > 0
  const hasEgp = currencyQuery.data?.some(row => row.value === CATALOG_STARTER.currencyCode) ?? false

  async function createStage(stage: NativeCatalogStage) {
    const query = queries[stage]
    if (inFlight.current || !hasEgp || query.isFetching || !query.data || ready(stage)) return
    inFlight.current = true
    setBusy(stage)
    setSaved(null)
    setError('')
    try {
      const previous = getCurrentOrganizationScope()
      if (previous.tenantId !== scope.tenantId ||
          previous.organizationId !== scope.organizationId) throw new Error('Organization changed')
      const required = stage === 'product' || stage === 'priceKind' ? [] :
        stage === 'variant' ? ['product'] :
        stage === 'offer' ? ['product', 'channel'] :
        ['product', 'variant', 'priceKind', 'channel', 'offer']
      for (const key of required) {
        if (!validCatalogId(ids[key as keyof typeof ids])) throw new Error('Required native record missing')
      }
      // Refresh the canonical list before creating; a stale tab must not invent a duplicate.
      const fresh = await query.refetch()
      if (!fresh.data || matchingCatalogRows(stage, fresh.data, scope, ids).length) {
        throw new Error('Record already exists or its status cannot be verified')
      }
      const payload = buildCatalogSetupRequest(stage, scope, ids)
      const result = await apiCall<{ id?: string }>(payload.path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.body),
      })
      if (!result.ok || !validCatalogId(result.result?.id)) {
        throw new Error('Official catalog module rejected or did not confirm creation')
      }
      const current = getCurrentOrganizationScope()
      if (current.tenantId !== scope.tenantId ||
          current.organizationId !== scope.organizationId) throw new Error('Organization changed while saving; inspect native records')
      await query.refetch()
      setSaved(stage)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Catalog setup failed')
    } finally {
      setBusy(null)
      inFlight.current = false
    }
  }

  function refreshAll() {
    if (inFlight.current) return
    void currencyQuery.refetch()
    void channelQuery.refetch()
    void productQuery.refetch()
    void priceKindQuery.refetch()
    if (productId) void variantQuery.refetch()
    if (productId && channelId) void offerQuery.refetch()
    if (priceQuery.isEnabled) void priceQuery.refetch()
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4" aria-label={t('premier_pos.catalogSetupTitle')}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('premier_pos.catalogSetupTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('premier_pos.catalogSetupDescription')}</p>
        </div>
        <Button type="button" variant="outline" disabled={busy !== null} onClick={refreshAll}>
          {t('premier_pos.traceRefresh')}
        </Button>
      </header>
      {!hasEgp || !channelId ? (
        <p role="status" className="rounded-md border p-3 text-sm">
          {t('premier_pos.catalogSetupPrerequisites')}
        </p>
      ) : null}
      {error ? <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p> : null}
      {saved ? <p role="status" className="rounded-md border p-3 text-sm">{t('premier_pos.setupSaved')}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CATALOG_SETUP_STAGES.map((stage) => {
          const q = queries[stage]
          const exists = ready(stage)
          const prerequisites = stage === 'product' || stage === 'priceKind' ? true :
            stage === 'variant' ? Boolean(productId) :
              stage === 'offer' ? Boolean(productId && channelId) :
                Boolean(productId && variantId && priceKindId && offerId && channelId)
          const canCreate = hasEgp && prerequisites && !busy && q.data !== undefined &&
            !q.isFetching && !q.isPending && !q.isError && !exists
          return (
            <article key={stage} className="space-y-2 rounded-lg border p-3">
              <h3 className="font-semibold">{t(`premier_pos.catalogSetup.${stage}`)}</h3>
              <p className="text-sm text-muted-foreground">
                {q.isError ? t('premier_pos.setupUnavailable') : q.isPending || q.isFetching
                  ? t('premier_pos.loading') : exists ? t('premier_pos.setupReady') :
                    prerequisites ? t('premier_pos.setupMissing') : t('premier_pos.catalogSetupWaiting')}
              </p>
              {exists ? <p className="text-xs text-muted-foreground">
                {String(setupRowField(rowsFor(stage)[0], 'sku') ??
                  setupRowField(rowsFor(stage)[0], 'code') ??
                  setupRowField(rowsFor(stage)[0], 'title') ?? '—')}
              </p> : null}
              <Button type="button" size="sm" disabled={!canCreate} onClick={() => void createStage(stage)}>
                {busy === stage ? t('premier_pos.loading') : t(`premier_pos.catalogSetupCreate.${stage}`)}
              </Button>
            </article>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">{t('premier_pos.catalogSetupNotice')}</p>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link className="underline" href="/backend/catalog/products">{t('premier_pos.manageProducts')}</Link>
        <Link className="underline" href="/backend/pos">{t('premier_pos.title')}</Link>
      </div>
    </section>
  )
}
