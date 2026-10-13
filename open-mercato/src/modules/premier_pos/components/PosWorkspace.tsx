'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import { Search, ShoppingCart, Plus, Minus, Trash2, Pause, Printer, Loader2, Package, CreditCard, ListOrdered } from 'lucide-react'
import { useT, useLocale } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeDetail } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { getCurrentOrganizationScope } from '@open-mercato/shared/lib/frontend/organizationEvents'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { createSalesOrderLineDraft, type SalesOrderLineDraft } from '@open-mercato/core/modules/sales/components/documents/SalesOrderDraftLines'
import { AppearanceControls } from '@/components/AppearanceControls'
import { saveOrder, captureSale, readSavedOrder, type PosIntent, type PosSavedOrder, type Row, nativeTransport, type PosTransport } from '../lib/checkout'

const LineItemDialog = dynamic(() => import('@open-mercato/core/modules/sales/components/documents/LineItemDialog').then((module) => module.LineItemDialog), { ssr: false })
function useDelayed<T>(value: T) {
  const [delayed, setDelayed] = useState(value)
  useEffect(() => { const timer = setTimeout(() => setDelayed(value), 250); return () => clearTimeout(timer) }, [value])
  return delayed
}
function text(row: Row, ...keys: string[]) { return keys.map((key) => row[key]).find((value) => typeof value === 'string') as string | undefined }
function cleanLine(payload: Row): Row {
  const { organizationId: _org, tenantId: _tenant, orderId: _order, quoteId: _quote, totalNetAmount: _net, totalGrossAmount: _gross, taxAmount: _tax, ...line } = payload
  return line
}
export function PosWorkspace({ userId }: { userId: string }) {
  const scope = useOrganizationScopeDetail()
  // Remount all drafts and query state on scope changes. Never carry an order to another org.
  return <ScopedWorkspace key={`${userId}:${scope.tenantId}:${scope.organizationId}`} userId={userId} tenantId={scope.tenantId} organizationId={scope.organizationId} />
}
function ScopedWorkspace({ userId, tenantId, organizationId }: { userId: string; tenantId: string | null; organizationId: string | null }) {
  const t = useT(), locale = useLocale()
  const [search, setSearch] = useState(''), [category, setCategory] = useState(''), [page, setPage] = useState(1)
  const [channelId, setChannelId] = useState(''), [currencyCode, setCurrencyCode] = useState(''), [customerId, setCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState(''), [paymentMethodId, setPaymentMethodId] = useState('')
  const [cart, setCart] = useState<SalesOrderLineDraft[]>([]), [held, setHeld] = useState<Array<{ lines: SalesOrderLineDraft[]; channelId: string; currencyCode: string; customerId: string; customerSearch: string }>>([])
  const [dialog, setDialog] = useState<SalesOrderLineDraft | null>(null), [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState<PosSavedOrder | null>(null)
  const [mobileCart, setMobileCart] = useState(false), [receiptLines, setReceiptLines] = useState<Row[]>([])
  const intent = useRef<PosIntent | null>(null), busyRef = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const transport = useMemo<PosTransport>(() => {
    const assertCurrent = () => { const current = getCurrentOrganizationScope(); if (!mounted.current || current.tenantId !== tenantId || current.organizationId !== organizationId) throw new Error('POS scope changed') }
    return { create: async (path, body) => { assertCurrent(); return nativeTransport.create(path, body) }, list: async (path, query) => { assertCurrent(); return nativeTransport.list(path, query) }, number: async (kind, context) => { assertCurrent(); return nativeTransport.number(kind, context) } }
  }, [tenantId, organizationId])
  const scopeKey = useMemo(() => ['premier-pos', userId, tenantId, organizationId], [userId, tenantId, organizationId])
  const enabled = Boolean(tenantId && organizationId)
  const delayedSearch = useDelayed(search), delayedCustomer = useDelayed(customerSearch)
  const channels = useQuery({ queryKey: [...scopeKey, 'channels'], enabled, staleTime: 60000, retry: false, queryFn: ({ signal }) => fetchCrudList<Row>('sales/channels', { pageSize: 100, isActive: true }, { signal }) })
  const categories = useQuery({ queryKey: [...scopeKey, 'categories'], enabled, staleTime: 60000, retry: false, queryFn: ({ signal }) => fetchCrudList<Row>('catalog/categories', { pageSize: 100, status: 'active' }, { signal }) })
  const currencies = useQuery({ queryKey: [...scopeKey, 'currencies'], enabled, staleTime: 60000, retry: false, queryFn: async ({ signal }) => {
    const call = await apiCall<{ entries?: Array<{ value: string; label?: string }> }>('/api/customers/dictionaries/currency', { signal })
    if (!call.ok) throw new Error('Currencies unavailable')
    return call.result?.entries ?? []
  } })
  const methods = useQuery({ queryKey: [...scopeKey, 'methods'], enabled, staleTime: 60000, retry: false, queryFn: async ({ signal }) => {
    const call = await apiCall<{ items?: Row[] }>('/api/premier_pos/payment-methods', { signal })
    if (!call.ok) throw new Error('Payment methods unavailable')
    return call.result?.items ?? []
  } })
  const configured = enabled && Boolean(channelId && currencyCode)
  const products = useQuery({ queryKey: [...scopeKey, 'products', channelId, currencyCode, customerId, category, delayedSearch, page], enabled: configured, staleTime: 30000, retry: false, queryFn: ({ signal }) => fetchCrudList<Row>('catalog/products', { pageSize: 24, page, search: delayedSearch || undefined, isActive: true, categoryIds: category || undefined, channelIds: channelId, channelId, currencyCode, customerId: customerId || undefined }, { signal }) })
  const customers = useQuery({ queryKey: [...scopeKey, 'customers', delayedCustomer], enabled: enabled && delayedCustomer.length >= 2 && !cart.length, staleTime: 30000, retry: false, queryFn: async ({ signal }) => {
    const lists = await Promise.all(['people', 'companies'].map((kind) => fetchCrudList<Row>(`customers/${kind}`, { search: delayedCustomer, pageSize: 10 }, { signal })))
    return lists.flatMap((list) => list.items)
  } })
  const fingerprint = JSON.stringify(cart.map((line) => cleanLine(line.payload)))
  const delayedCart = useDelayed(fingerprint)
  const preview = useQuery({ queryKey: [...scopeKey, 'preview', channelId, currencyCode, delayedCart], enabled: configured && cart.length > 0 && !intent.current?.orderId, staleTime: 0, gcTime: 0, retry: false, queryFn: async ({ signal }) => {
    const call = await apiCall<{ totals: Record<string, number>; lines: Array<{ grossAmount: number }> }>('/api/premier_pos/preview', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedTenantId: tenantId, expectedOrganizationId: organizationId, channelId, currencyCode, lines: JSON.parse(delayedCart) }) })
    if (!call.ok || !call.result) throw new Error(t('premier_pos.previewError'))
    return call.result
  } })
  const previewReady = fingerprint === delayedCart && !preview.isFetching && Boolean(preview.data) && !preview.isError
  const locked = busy || Boolean(intent.current)
  const money = (value: unknown) => {
    const number = Number(value)
    if (!Number.isFinite(number) || !/^[A-Z]{3}$/.test(currencyCode)) return '—'
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).format(number)
  }
  const totals = saved ?? preview.data?.totals
  const selectClasses = 'h-9 min-w-0 rounded-md border border-input bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  function newOrder() {
    if (busyRef.current) return
    if (intent.current?.paymentUncertain && !intent.current.paymentId) { setError(t('premier_pos.checkoutError')); return }
    if (cart.length && !saved && !window.confirm(t('premier_pos.discardConfirm'))) return
    intent.current = null; setCart([]); setSaved(null); setReceiptLines([]); setError(''); setMobileCart(false)
  }
  function updateLine(id: string, payload: Row) {
    if (locked) return
    setCart((lines) => lines.map((line) => line.id === id ? createSalesOrderLineDraft(cleanLine(payload), id) : line))
  }
  function openItem(product?: Row) {
    if (locked || !configured || cart.length >= 100) return
    if (product) {
      const pricing = (product.pricing && typeof product.pricing === 'object' ? product.pricing : {}) as Row
      if (pricing.unit_price_net == null && pricing.unit_price_gross == null) { setDialog(null); setDialogOpen(true); return }
      const payload: Row = { name: text(product, 'title', 'name'), productId: product.id, currencyCode, quantity: 1, kind: product.type === 'service' ? 'service' : 'product', priceMode: pricing.unit_price_gross !== undefined ? 'gross' : 'net', ...(pricing.unit_price_net != null ? { unitPriceNet: pricing.unit_price_net } : {}), ...(pricing.unit_price_gross != null ? { unitPriceGross: pricing.unit_price_gross } : {}), ...(pricing.tax_rate != null ? { taxRate: pricing.tax_rate } : {}), catalogSnapshot: { sku: product.sku ?? null } }
      setDialog(createSalesOrderLineDraft(payload))
    } else setDialog(null)
    setDialogOpen(true)
  }
  async function checkout(pay: boolean) {
    if (busyRef.current || !tenantId || !organizationId || !cart.length || (!intent.current && !previewReady) || (pay && !paymentMethodId)) return
    busyRef.current = true; setBusy(true); setError('')
    if (!intent.current) intent.current = { reference: crypto.randomUUID(), tenantId, organizationId, currencyCode, channelId, customerEntityId: customerId || undefined, lines: cart.map((line) => cleanLine(line.payload)) }
    try {
      const order = pay ? await captureSale(intent.current, paymentMethodId, transport) : await saveOrder(intent.current, transport)
      if (!mounted.current) return
      setSaved(order); setMobileCart(true)
      const rows = await fetchCrudList<Row>('sales/order-lines', { orderId: order.id, pageSize: 100 })
      if (mounted.current) setReceiptLines(rows.items)
      if (pay && Number(order.outstandingAmount) > 0) setError(t('premier_pos.paymentPending'))
    } catch {
      if (!mounted.current) return
      setError(t('premier_pos.checkoutError'))
      if (intent.current.orderId) {
        try { const order = await readSavedOrder(intent.current, transport); if (mounted.current) setSaved(order) } catch { /* Keep the intent and IDs for explicit reconciliation. */ }
      }
    } finally { busyRef.current = false; if (mounted.current) setBusy(false) }
  }
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  return (
    <section className="premier-pos mx-auto flex w-full max-w-[1600px] flex-col gap-3 p-2 md:p-3" aria-label={t('premier_pos.title')}>
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-2">
        <div className="flex items-center gap-2"><ShoppingCart className="size-5 text-primary" /><h1 className="font-bold">{t('premier_pos.title')}</h1></div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy || Boolean(intent.current?.paymentUncertain && !intent.current?.paymentId)} onClick={newOrder}><Plus className="size-4" />{t('premier_pos.new')}</Button>
          <Link href="/backend/sales/orders" className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm"><ListOrdered className="size-4" />{t('premier_pos.orders')}</Link>
          <AppearanceControls />
        </div>
      </header>
      {!enabled ? <p role="status" className="rounded-lg border bg-card p-4">{t('premier_pos.scopeRequired')}</p> : null}
      {offline ? <p role="alert" className="rounded-lg border border-border bg-card p-3">{t('premier_pos.offline')}</p> : null}
      <div className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs">{t('premier_pos.channel')}<select className={selectClasses} value={channelId} disabled={locked || cart.length > 0} onChange={(event) => { setChannelId(event.target.value); setPage(1) }}><option value="">{t('premier_pos.chooseChannel')}</option>{channels.data?.items.map((row) => <option key={String(row.id)} value={String(row.id)}>{text(row, 'name')}</option>)}</select></label>
        <label className="grid gap-1 text-xs">{t('premier_pos.currency')}<select className={selectClasses} value={currencyCode} disabled={locked || cart.length > 0} onChange={(event) => setCurrencyCode(event.target.value)}><option value="">{t('premier_pos.chooseCurrency')}</option>{currencies.data?.map((row) => <option key={row.value} value={row.value.toUpperCase()}>{row.label || row.value}</option>)}</select></label>
        <label className="grid gap-1 text-xs">{t('premier_pos.customerSearch')}<Input value={customerSearch} disabled={locked || cart.length > 0} onChange={(event) => setCustomerSearch(event.target.value)} placeholder={t('premier_pos.customerPlaceholder')} /></label>
        <label className="grid gap-1 text-xs">{t('premier_pos.customer')}<select className={selectClasses} value={customerId} disabled={locked || cart.length > 0} onChange={(event) => setCustomerId(event.target.value)}><option value="">{t('premier_pos.walkIn')}</option>{customers.data?.map((row) => <option key={String(row.id)} value={String(row.id)}>{text(row, 'display_name', 'displayName', 'name', 'title')}</option>)}</select></label>
      </div>
      {channels.isError || currencies.isError || channels.data?.items.length === 0 || currencies.data?.length === 0 ? <div role="alert" className="rounded-xl border bg-card p-3 text-sm">{t('premier_pos.configRequired')} <Link href="/backend/sales/channels/create" className="text-primary underline">{t('premier_pos.configureChannels')}</Link>{' · '}<Link href="/backend/config/sales" className="text-primary underline">{t('premier_pos.configureSales')}</Link></div> : null}
      <div className="flex gap-2 lg:hidden"><Button variant={!mobileCart ? 'default' : 'outline'} onClick={() => setMobileCart(false)}>{t('premier_pos.products')}</Button><Button variant={mobileCart ? 'default' : 'outline'} onClick={() => setMobileCart(true)}>{t('premier_pos.cart')} ({cart.length})</Button></div>
      <div className="grid min-h-[520px] gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className={`${mobileCart ? 'hidden lg:flex' : 'flex'} min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3`}>
          <div className="relative"><Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" /><Input className="ps-9" aria-label={t('premier_pos.search')} placeholder={t('premier_pos.search')} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></div>
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={t('premier_pos.categories')}><Button size="sm" variant={!category ? 'default' : 'outline'} onClick={() => { setCategory(''); setPage(1) }}>{t('premier_pos.all')}</Button>{categories.data?.items.map((row) => <Button key={String(row.id)} size="sm" variant={category === row.id ? 'default' : 'outline'} onClick={() => { setCategory(String(row.id)); setPage(1) }}>{text(row, 'name')}</Button>)}</div>
          {!configured ? <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">{t('premier_pos.chooseSetup')}</div> : products.isPending ? <div className="flex flex-1 items-center justify-center" role="status"><Loader2 className="size-6 animate-spin" /><span className="sr-only">{t('premier_pos.loading')}</span></div> : products.isError ? <div role="alert" className="p-4">{t('premier_pos.loadError')} <Button variant="outline" onClick={() => void products.refetch()}>{t('premier_pos.retry')}</Button></div> : products.data?.items.length === 0 ? <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"><Package className="size-12 text-muted-foreground" /><p>{t('premier_pos.emptyProducts')}</p><Link href="/backend/catalog/products" className="text-primary underline">{t('premier_pos.manageProducts')}</Link></div> : <div className="grid content-start grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{products.data?.items.map((product) => {
            const pricing = (product.pricing ?? {}) as Row
            return <button type="button" key={String(product.id)} disabled={locked} onClick={() => openItem(product)} className="group flex min-h-36 flex-col items-center justify-between gap-2 rounded-xl border border-border bg-background p-3 text-center transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
              {text(product, 'default_media_url', 'defaultMediaUrl') ? <Image src={text(product, 'default_media_url', 'defaultMediaUrl')!} alt="" width={80} height={80} unoptimized loading="lazy" className="size-20 rounded-lg object-contain" /> : <Package className="size-8 text-primary" aria-hidden="true" />}<span className="line-clamp-2 text-sm font-semibold">{text(product, 'title', 'name')}</span><span dir="ltr" className="text-xs text-muted-foreground">{text(product, 'sku')}</span><span className="text-sm font-bold text-primary">{pricing.unit_price_gross != null ? money(pricing.unit_price_gross) : pricing.unit_price_net != null ? money(pricing.unit_price_net) : t('premier_pos.configurePrice')}</span>
            </button>
          })}</div>}
          <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3"><Button size="sm" variant="outline" disabled={page <= 1 || products.isFetching} onClick={() => setPage((value) => value - 1)}>{t('ui.dataTable.pagination.previous')}</Button><span className="text-xs text-muted-foreground">{t('ui.dataTable.pagination.pageInfo', { page, totalPages: Math.max(1, products.data?.totalPages ?? 1) })}</span><Button size="sm" variant="outline" disabled={!products.data || page >= products.data.totalPages || products.isFetching} onClick={() => setPage((value) => value + 1)}>{t('ui.dataTable.pagination.next')}</Button></div>
        </div>
        <aside className={`${!mobileCart ? 'hidden lg:flex' : 'flex'} min-w-0 flex-col rounded-xl border border-border bg-card`}>
          <div className="flex items-center justify-between border-b p-3"><h2 className="font-bold">{t('premier_pos.cart')} ({cart.length})</h2><Button size="sm" variant="outline" disabled={locked || !configured} onClick={() => openItem()}><Plus className="size-4" />{t('premier_pos.customItem')}</Button></div>
          <div className="max-h-[50svh] flex-1 space-y-2 overflow-y-auto p-3">
            {!cart.length ? <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground"><ShoppingCart className="size-10" /><p className="text-sm">{t('premier_pos.emptyCart')}</p></div> : cart.map((line, index) => <article key={line.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex justify-between gap-2"><button type="button" disabled={locked} className="text-start text-sm font-semibold hover:text-primary" onClick={() => { setDialog(line); setDialogOpen(true) }}>{String(line.payload.name ?? t('premier_pos.item'))}</button><Button size="sm" variant="ghost" aria-label={t('premier_pos.remove')} disabled={locked} onClick={() => setCart((lines) => lines.filter((row) => row.id !== line.id))}><Trash2 className="size-4" /></Button></div>
              <div className="mt-2 flex items-center justify-between gap-2"><div className="flex items-center gap-1"><Button size="sm" variant="outline" disabled={locked || Number(line.payload.quantity) <= 1} aria-label={t('premier_pos.decrease')} onClick={() => updateLine(line.id, { ...line.payload, quantity: Number(line.payload.quantity) - 1 })}><Minus className="size-3" /></Button><Input className="h-8 w-16 text-center" type="number" min="0.0001" step="any" aria-label={t('premier_pos.quantity')} value={String(line.payload.quantity)} disabled={locked} onChange={(event) => { if (Number(event.target.value) > 0) updateLine(line.id, { ...line.payload, quantity: Number(event.target.value) }) }} /><Button size="sm" variant="outline" disabled={locked} aria-label={t('premier_pos.increase')} onClick={() => updateLine(line.id, { ...line.payload, quantity: Number(line.payload.quantity) + 1 })}><Plus className="size-3" /></Button></div><span className="text-sm font-bold">{previewReady ? money(preview.data?.lines[index]?.grossAmount) : '—'}</span></div>
            </article>)}
          </div>
          <div className="space-y-3 border-t p-3">
            {preview.isError ? <p role="alert" className="text-sm text-destructive">{t('premier_pos.previewError')}</p> : null}
            <div className="space-y-1 text-sm"><div className="flex justify-between"><span>{t('premier_pos.discount')}</span><span>{money(totals?.discountTotalAmount)}</span></div><div className="flex justify-between"><span>{t('premier_pos.tax')}</span><span>{money(totals?.taxTotalAmount)}</span></div><div className="flex justify-between text-xl font-bold"><span>{t('premier_pos.total')}</span><span aria-live="polite">{preview.isFetching && !saved ? '…' : money(totals?.grandTotalGrossAmount)}</span></div></div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            {saved ? <div role="status" className="rounded-lg border p-2 text-sm"><p>{t('premier_pos.orderSaved')} {String(saved.orderNumber ?? '')}</p><p>{Number(saved.outstandingAmount) === 0 ? t('premier_pos.paid') : t('premier_pos.paymentPending')}</p><Link href={`/backend/sales/documents/${saved.id}?kind=order`} className="text-primary underline">{t('premier_pos.review')}</Link></div> : null}
            <label className="grid gap-1 text-xs">{t('premier_pos.paymentMethod')}<select className={selectClasses} value={paymentMethodId} disabled={busy || Boolean(intent.current?.paymentId) || Boolean(intent.current?.paymentUncertain)} onChange={(event) => setPaymentMethodId(event.target.value)}><option value="">{t('premier_pos.choosePayment')}</option>{methods.data?.map((row) => <option key={String(row.id)} value={String(row.id)}>{text(row, 'name')}</option>)}</select></label>
            {methods.isError || methods.data?.length === 0 ? <Link href="/backend/config/sales" className="block text-xs text-primary underline">{t('premier_pos.configurePayments')}</Link> : null}
            <Button className="w-full py-5" disabled={busy || offline || !cart.length || (!intent.current && !previewReady) || !paymentMethodId || Number(saved?.outstandingAmount) === 0} onClick={() => void checkout(true)}>{busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}{t(intent.current?.paymentUncertain ? 'premier_pos.verifyPayment' : 'premier_pos.pay')}</Button>
            <div className="grid grid-cols-2 gap-2"><Button variant="outline" disabled={busy || offline || !cart.length || Boolean(saved) || (!intent.current && !previewReady)} onClick={() => void checkout(false)}>{t('premier_pos.saveOrder')}</Button><Button variant="outline" disabled={locked || !cart.length} onClick={() => { setHeld((drafts) => [...drafts, { lines: cart, channelId, currencyCode, customerId, customerSearch }]); setCart([]); setSaved(null) }}><Pause className="size-4" />{t('premier_pos.hold')}</Button></div>
            {saved && Number(saved.outstandingAmount) === 0 ? <Button variant="outline" className="w-full" disabled={receiptLines.length !== cart.length || !intent.current?.invoiceId} onClick={() => window.print()}><Printer className="size-4" />{t('premier_pos.print')}</Button> : null}
            {held.map((draft, index) => <Button key={index} size="sm" variant="outline" disabled={locked || cart.length > 0} onClick={() => { setChannelId(draft.channelId); setCurrencyCode(draft.currencyCode); setCustomerId(draft.customerId); setCustomerSearch(draft.customerSearch); setCart(draft.lines); setHeld((drafts) => drafts.filter((_, i) => i !== index)) }}>{t('premier_pos.resume', { number: index + 1 })}</Button>)}
          </div>
        </aside>
      </div>
      {saved && Number(saved.outstandingAmount) === 0 && intent.current?.invoiceId ? <div className="pos-receipt">
        <Image src="/brand/premier-os-icon.png" alt="PremierOS" width={56} height={56} unoptimized />
        <h1>PremierOS · {t('premier_pos.receipt')}</h1><p>{String(saved.orderNumber ?? '')}</p><p>{intent.current.invoiceNumber}</p>
        <p>{String(saved.createdAt ?? '')}</p>
        {receiptLines.map((line) => <div key={String(line.id)} className="flex justify-between gap-2 border-b py-2"><span>{String(line.name ?? '')} × {String(line.quantity ?? '')}</span><span>{money(line.totalGrossAmount ?? line.total_gross_amount)}</span></div>)}
        <p>{t('premier_pos.tax')}: {money(saved.taxTotalAmount)}</p><p>{t('premier_pos.discount')}: {money(saved.discountTotalAmount)}</p><p className="font-bold">{t('premier_pos.total')}: {money(saved.grandTotalGrossAmount)}</p><p>{t('premier_pos.paid')}</p><p className="text-xs">{t('premier_pos.receiptNote')}</p>
      </div> : null}
      {dialogOpen ? <LineItemDialog open kind="order" currencyCode={currencyCode} organizationId={organizationId} tenantId={tenantId} initialLine={dialog?.record ?? null} onOpenChange={setDialogOpen} onDraftSaved={(payload) => { const cleaned = cleanLine(payload); setCart((lines) => dialog && lines.some((line) => line.id === dialog.id) ? lines.map((line) => line.id === dialog.id ? createSalesOrderLineDraft(cleaned, line.id) : line) : [...lines, createSalesOrderLineDraft(cleaned)]); setDialogOpen(false) }} /> : null}
    </section>
  )
}
