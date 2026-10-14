'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { useT, useLocale } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeDetail } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import {
  isScopedTraceRow, relatedTraceRows, traceAmount, traceField, traceLabel,
  type TraceRow, type TraceScope,
} from '../lib/order-trace'

type Source = 'invoice' | 'shipment' | 'payment' | 'credit' | 'movement'
const sourcePaths: Record<Source, string> = {
  invoice: 'sales/invoices',
  shipment: 'sales/shipments',
  payment: 'sales/payments',
  credit: 'sales/credit-memos',
  movement: 'wms/inventory/movements',
}

function valueId(row: TraceRow) {
  return typeof row.id === 'string' ? row.id : ''
}

export function OrderLifecycleWorkspace({ userId }: { userId: string }) {
  const scope = useOrganizationScopeDetail()
  return (
    <ScopedLifecycle
      key={`${userId}:${scope.tenantId}:${scope.organizationId}`}
      userId={userId}
      tenantId={scope.tenantId}
      organizationId={scope.organizationId}
    />
  )
}
function ScopedLifecycle({
  userId, tenantId, organizationId,
}: { userId: string; tenantId: string | null; organizationId: string | null }) {
  const t = useT()
  const locale = useLocale()
  const [page, setPage] = useState(1)
  const [selectedOrder, setSelectedOrder] = useState<TraceRow | null>(null)
  const scope: TraceScope = { tenantId: tenantId ?? '', organizationId: organizationId ?? '' }
  const enabled = Boolean(tenantId && organizationId)
  const prefix = ['premier-pos-order-lifecycle', userId, tenantId, organizationId]
  const orderId = selectedOrder ? valueId(selectedOrder) : ''
  const orders = useQuery({
    queryKey: [...prefix, 'orders', page], enabled, retry: false, staleTime: 15000,
    queryFn: ({ signal }) => fetchCrudList<TraceRow>('sales/orders', {
      page, pageSize: 20, sortField: 'createdAt', sortDir: 'desc',
    }, { signal }),
  })
  const invoices = useQuery({
    queryKey: [...prefix, orderId, 'invoices'], enabled: enabled && Boolean(orderId), retry: false,
    queryFn: ({ signal }) => fetchCrudList<TraceRow>(sourcePaths.invoice, { orderId, pageSize: 100 }, { signal }),
  })
  const payments = useQuery({
    queryKey: [...prefix, orderId, 'payments'], enabled: enabled && Boolean(orderId), retry: false,
    queryFn: ({ signal }) => fetchCrudList<TraceRow>(sourcePaths.payment, { orderId, pageSize: 100 }, { signal }),
  })
  const credits = useQuery({
    queryKey: [...prefix, orderId, 'credits'], enabled: enabled && Boolean(orderId), retry: false,
    queryFn: ({ signal }) => fetchCrudList<TraceRow>(sourcePaths.credit, { orderId, pageSize: 100 }, { signal }),
  })
  const shipments = useQuery({
    queryKey: [...prefix, orderId, 'shipments'], enabled: enabled && Boolean(orderId), retry: false,
    queryFn: ({ signal }) => fetchCrudList<TraceRow>(sourcePaths.shipment, { orderId, pageSize: 100 }, { signal }),
  })
  const movements = useQuery({
    queryKey: [...prefix, orderId, 'movements'], enabled: enabled && Boolean(orderId), retry: false,
    queryFn: ({ signal }) => fetchCrudList<TraceRow>(sourcePaths.movement, {
      referenceType: 'so', referenceId: orderId, pageSize: 100,
    }, { signal }),
  })
  const formatAmount = (value: unknown, code: unknown) => {
    const amount = traceAmount(value)
    if (amount === null || typeof code !== 'string' || !/^[A-Z]{3}$/.test(code)) return '—'
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency: code, maximumFractionDigits: 4,
    }).format(amount)
  }
  const currency = selectedOrder && traceField(selectedOrder, 'currencyCode')
  const cards: Array<{
    kind: Source; title: string; result: typeof invoices; numberField: string;
  }> = [
    { kind: 'invoice', title: t('premier_pos.traceInvoices'), result: invoices, numberField: 'invoiceNumber' },
    { kind: 'payment', title: t('premier_pos.tracePayments'), result: payments, numberField: 'paymentReference' },
    { kind: 'shipment', title: t('premier_pos.traceShipments'), result: shipments, numberField: 'shipmentNumber' },
    { kind: 'credit', title: t('premier_pos.traceCredits'), result: credits, numberField: 'creditMemoNumber' },
    { kind: 'movement', title: t('premier_pos.traceMovements'), result: movements, numberField: 'type' },
  ]
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-3" aria-label={t('premier_pos.traceTitle')}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t('premier_pos.traceTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('premier_pos.traceDescription')}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <button type="button" disabled={!enabled || orders.isFetching} className="rounded-md border px-3 py-2 disabled:opacity-50"
            onClick={() => {
              void orders.refetch()
              if (orderId) {
                void invoices.refetch()
                void payments.refetch()
                void shipments.refetch()
                void credits.refetch()
                void movements.refetch()
              }
            }}>{t('premier_pos.traceRefresh')}</button>
          <Link className="rounded-md border px-3 py-2 underline" href="/backend/pos">{t('premier_pos.title')}</Link>
          <Link className="rounded-md border px-3 py-2 underline" href="/backend/wms/inventory">{t('premier_pos.inventory')}</Link>
        </div>
      </header>
      {!enabled ? <p role="alert" className="rounded-md border p-4">{t('premier_pos.scopeRequired')}</p> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
          <div className="space-y-2 rounded-lg border bg-card p-3">
            <h2 className="font-semibold">{t('premier_pos.traceOrders')}</h2>
            {orders.isPending ? <p role="status">{t('premier_pos.loading')}</p> : orders.isError ? (
              <p role="alert">{t('premier_pos.traceUnavailable')}</p>
            ) : orders.data.items.filter((r) => isScopedTraceRow(r, scope)).length === 0 ? (
              <p role="status">{t('premier_pos.traceEmpty')}</p>
            ) : orders.data.items.filter((r) => isScopedTraceRow(r, scope)).map((order) => (
              <button key={valueId(order)} type="button"
                className={`block w-full rounded-md border px-3 py-3 text-start hover:bg-accent ${orderId === valueId(order) ? 'border-primary bg-accent' : ''}`}
                onClick={() => setSelectedOrder(order)}>
                <span className="block font-semibold">{traceLabel(order, 'orderNumber')}</span>
                <span className="block text-xs text-muted-foreground">{traceLabel(order, 'status')}</span>
                <span className="block text-sm">{formatAmount(traceField(order, 'grandTotalGrossAmount'), traceField(order, 'currencyCode'))}</span>
              </button>
            ))}
            <div className="flex justify-between gap-2 border-t pt-2">
              <button className="rounded border px-3 py-1 disabled:opacity-40" type="button" disabled={page <= 1 || orders.isFetching} onClick={() => setPage((n) => n - 1)}>{t('ui.dataTable.pagination.previous')}</button>
              <span className="text-sm">{page}</span>
              <button className="rounded border px-3 py-1 disabled:opacity-40" type="button" disabled={!orders.data || page >= orders.data.totalPages || orders.isFetching} onClick={() => setPage((n) => n + 1)}>{t('ui.dataTable.pagination.next')}</button>
            </div>
          </div>
          <div className="space-y-4">
            {!selectedOrder || !orderId ? (
              <p className="rounded-lg border bg-card p-5 text-sm">{t('premier_pos.traceChooseOrder')}</p>
            ) : (
              <>
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold">{traceLabel(selectedOrder, 'orderNumber')}</h2>
                    <Link href={`/backend/sales/documents/${encodeURIComponent(orderId)}?kind=order`} className="text-sm underline">{t('premier_pos.review')}</Link>
                  </div>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    {[
                      [t('premier_pos.total'), formatAmount(traceField(selectedOrder, 'grandTotalGrossAmount'), currency)],
                      [t('premier_pos.tracePaid'), formatAmount(traceField(selectedOrder, 'paidTotalAmount'), currency)],
                      [t('premier_pos.traceOutstanding'), formatAmount(traceField(selectedOrder, 'outstandingAmount'), currency)],
                      [t('premier_pos.traceFulfillment'), traceLabel(selectedOrder, 'fulfillmentStatus')],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded border p-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>
                    ))}
                  </dl>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {cards.map(({ kind, title, result, numberField }) => (
                    <article key={kind} className="rounded-lg border bg-card p-3">
                      <h3 className="font-semibold">{title}</h3>
                      {result.isPending ? <p role="status" className="text-sm">{t('premier_pos.loading')}</p> :
                        result.isError ? <p role="alert" className="text-sm">{t('premier_pos.traceUnavailable')}</p> :
                          relatedTraceRows(result.data.items, scope, orderId, kind).length === 0 ?
                            <p className="text-sm text-muted-foreground">{t('premier_pos.traceNone')}</p> :
                            <ul className="mt-2 space-y-1 text-sm">
                              {relatedTraceRows(result.data.items, scope, orderId, kind).slice(0, 20).map((row, index) => (
                                <li key={valueId(row) || index} className="flex justify-between gap-2 border-t py-1">
                                  <span>{traceLabel(row, numberField)}</span>
                                  <span>{kind === 'payment'
                                    ? formatAmount(traceField(row, 'amount'), traceField(row, 'currencyCode'))
                                    : kind === 'movement' ? String(traceField(row, 'quantity') ?? '—')
                                      : traceLabel(row, 'status')}</span>
                                </li>
                              ))}
                            </ul>}
                    </article>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t('premier_pos.traceDisclaimer')}</p>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
