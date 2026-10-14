import { createCrud, fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

export type Row = Record<string, unknown>
export type PosIntent = {
  reference: string
  organizationId: string
  tenantId: string
  currencyCode: string
  channelId: string
  customerEntityId?: string
  lines: Row[]
  orderNumber?: string
  orderId?: string
  invoiceNumber?: string
  invoiceId?: string
  paymentId?: string
  paymentUncertain?: boolean
}
export type PosSavedOrder = Row & { id: string; grandTotalGrossAmount: number; currencyCode: string }
export type PosTransport = {
  create: (path: string, body: Row) => Promise<{ id: string }>
  list: (path: string, query: Row) => Promise<{ items: Row[] }>
  number: (kind: 'order' | 'invoice', scope: Pick<PosIntent, 'organizationId' | 'tenantId'>) => Promise<string>
}
export class UncertainCheckoutError extends Error { constructor(public stage: 'order' | 'invoice' | 'payment') { super(`POS_${stage.toUpperCase()}_UNCERTAIN`) } }

export const nativeTransport: PosTransport = {
  async create(path, body) {
    const call = await createCrud<{ id?: string; orderId?: string; invoiceId?: string; paymentId?: string }>(path, body)
    const id = call.result?.id ?? call.result?.orderId ?? call.result?.invoiceId ?? call.result?.paymentId
    if (!id) throw new Error('Missing saved record ID')
    return { id }
  },
  list: (path, query) => fetchCrudList<Row>(path, query),
  async number(kind, scope) {
    const call = await apiCall<{ number?: string }>('/api/premier_pos/number', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, expectedOrganizationId: scope.organizationId, expectedTenantId: scope.tenantId }) })
    if (!call.ok || !call.result?.number) throw new Error('Document numbering unavailable')
    return call.result.number
  },
}
function scope(intent: PosIntent) { return { tenantId: intent.tenantId, organizationId: intent.organizationId } }
function amount(row: Row, field: string) {
  if (row[field] === null || row[field] === undefined || row[field] === '') throw new Error(`Missing saved ${field}`)
  const value = Number(row[field])
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid saved ${field}`)
  return value
}
export async function readSavedOrder(intent: PosIntent, transport = nativeTransport): Promise<PosSavedOrder> {
  if (!intent.orderId) throw new Error('Order not saved')
  const result = await transport.list('sales/orders', { id: intent.orderId, pageSize: 1 })
  const row = result.items.find((item) => item.id === intent.orderId)
  if (!row || row.currencyCode !== intent.currencyCode || row.organizationId !== intent.organizationId || row.tenantId !== intent.tenantId || row.externalReference !== intent.reference || row.channelId !== intent.channelId) throw new Error('Saved order scope or reference changed')
  return { ...row, id: intent.orderId, currencyCode: intent.currencyCode, grandTotalGrossAmount: amount(row, 'grandTotalGrossAmount') }
}

/** The same reserved document number is retained across ambiguous responses. */
async function saveOrderInternal(intent: PosIntent, transport = nativeTransport) {
  if (intent.orderId) return readSavedOrder(intent, transport)
  if (!intent.orderNumber) intent.orderNumber = await transport.number('order', intent)
  const previous = await transport.list('sales/orders', { search: intent.orderNumber, pageSize: 20 })
  const existing = previous.items.find((row) => row.orderNumber === intent.orderNumber && row.externalReference === intent.reference && row.organizationId === intent.organizationId && row.tenantId === intent.tenantId)
  if (existing?.id) intent.orderId = String(existing.id)
  if (!intent.orderId) {
    try {
      const row = await transport.create('sales/orders', { ...scope(intent), orderNumber: intent.orderNumber, externalReference: intent.reference, currencyCode: intent.currencyCode, channelId: intent.channelId, ...(intent.customerEntityId ? { customerEntityId: intent.customerEntityId } : {}), lines: intent.lines.map(({ totalNetAmount: _net, totalGrossAmount: _gross, taxAmount: _tax, ...line }) => ({ ...line, currencyCode: intent.currencyCode })) })
      intent.orderId = row.id
    } catch {
      const result = await transport.list('sales/orders', { search: intent.orderNumber, pageSize: 20 })
      const recovered = result.items.find((row) => row.orderNumber === intent.orderNumber && row.externalReference === intent.reference && row.organizationId === intent.organizationId && row.tenantId === intent.tenantId)
      if (!recovered?.id) throw new UncertainCheckoutError('order')
      intent.orderId = String(recovered.id)
    }
  }
  return readSavedOrder(intent, transport)
}

/** Financial mutations are never retried automatically; committed IDs survive failures. */
async function captureSaleInternal(intent: PosIntent, paymentMethodId: string, transport = nativeTransport) {
  const order = await saveOrderInternal(intent, transport)
  const due = amount(order, 'outstandingAmount')
  if (!intent.invoiceId) {
    if (!intent.invoiceNumber) intent.invoiceNumber = await transport.number('invoice', intent)
    const existing = await transport.list('sales/invoices', { orderId: intent.orderId, pageSize: 100 })
    const recovered = existing.items.find((row) => (row.invoice_number ?? row.invoiceNumber) === intent.invoiceNumber && (row.order_id ?? row.orderId) === intent.orderId)
    if (recovered?.id) {
      const read = (name: string, snake: string) => recovered[name] ?? recovered[snake]
      if (read('tenantId', 'tenant_id') !== intent.tenantId ||
          read('organizationId', 'organization_id') !== intent.organizationId ||
          read('currencyCode', 'currency_code') !== intent.currencyCode) {
        throw new UncertainCheckoutError('invoice')
      }
      intent.invoiceId = String(recovered.id)
    }
    else {
      if (existing.items.length > 0) throw new UncertainCheckoutError('invoice')
      const { items } = await transport.list('sales/order-lines', { orderId: intent.orderId, pageSize: 100 })
      if (!items.length || items.length !== intent.lines.length) throw new Error('Saved order lines incomplete')
      const read = (line: Row, camel: string) => line[camel] ?? line[camel.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)]
      const fields = ['kind', 'name', 'quantity', 'quantityUnit', 'normalizedQuantity', 'normalizedUnit', 'uomSnapshot', 'unitPriceNet', 'unitPriceGross', 'discountAmount', 'discountPercent', 'taxRate', 'taxAmount', 'totalNetAmount', 'totalGrossAmount']
      const lines = items.map((line) => ({ orderLineId: line.id, currencyCode: intent.currencyCode, ...Object.fromEntries(fields.flatMap((key) => read(line, key) === undefined || read(line, key) === null ? [] : [[key, read(line, key)]])) }))
      const totals = ['subtotalNetAmount', 'subtotalGrossAmount', 'discountTotalAmount', 'taxTotalAmount', 'grandTotalNetAmount', 'grandTotalGrossAmount']
      try {
        const invoice = await transport.create('sales/invoices', { ...scope(intent), orderId: intent.orderId, invoiceNumber: intent.invoiceNumber, currencyCode: intent.currencyCode, lines, ...Object.fromEntries(totals.map((key) => [key, amount(order, key)])), metadata: { premierPosReference: intent.reference } })
        intent.invoiceId = invoice.id
      } catch { throw new UncertainCheckoutError('invoice') }
    }
  }
  if (due <= 0) return order
  if (!intent.paymentId) {
    const existing = await transport.list('sales/payments', { orderId: intent.orderId, pageSize: 100 })
    const recovered = existing.items.find((row) => (row.payment_reference ?? row.paymentReference) === intent.reference)
    if (recovered?.id) {
      // Recovery must never attach a foreign or mismatched tender merely because
      // its human-facing payment reference happens to match.
      const field = (name: string, alternate: string) => recovered[name] ?? recovered[alternate]
      if (field('orderId', 'order_id') !== intent.orderId ||
          field('tenantId', 'tenant_id') !== intent.tenantId ||
          field('organizationId', 'organization_id') !== intent.organizationId ||
          field('currencyCode', 'currency_code') !== intent.currencyCode ||
          field('paymentMethodId', 'payment_method_id') !== paymentMethodId ||
          Number(recovered.amount) !== due) {
        throw new UncertainCheckoutError('payment')
      }
      intent.paymentId = String(recovered.id)
    }
    else if (intent.paymentUncertain) throw new UncertainCheckoutError('payment')
    else {
      // Set before dispatch: even a lost response cannot cause a second capture.
      intent.paymentUncertain = true
      try {
        const payment = await transport.create('sales/payments', { ...scope(intent), orderId: intent.orderId, paymentMethodId, paymentReference: intent.reference, currencyCode: intent.currencyCode, amount: due, capturedAmount: due, receivedAt: new Date().toISOString(), capturedAt: new Date().toISOString(), allocations: [{ orderId: intent.orderId, invoiceId: intent.invoiceId, amount: due, currencyCode: intent.currencyCode }] })
        intent.paymentId = payment.id
        intent.paymentUncertain = false
      } catch { throw new UncertainCheckoutError('payment') }
    }
  }
  const saved = await readSavedOrder(intent, transport)
  if (amount(saved, 'outstandingAmount') > 0) throw new UncertainCheckoutError('payment')
  return saved
}

const activeOperations = new WeakMap<PosIntent, { kind: string; promise: Promise<PosSavedOrder> }>()
function serialize(intent: PosIntent, kind: string, operation: () => Promise<PosSavedOrder>): Promise<PosSavedOrder> {
  const active = activeOperations.get(intent)
  if (active) return active.kind === kind ? active.promise : active.promise.then(() => serialize(intent, kind, operation))
  const promise = Promise.resolve().then(operation).finally(() => { if (activeOperations.get(intent)?.promise === promise) activeOperations.delete(intent) })
  activeOperations.set(intent, { kind, promise })
  return promise
}
export function saveOrder(intent: PosIntent, transport = nativeTransport) { return serialize(intent, 'save', () => saveOrderInternal(intent, transport)) }
export function captureSale(intent: PosIntent, paymentMethodId: string, transport = nativeTransport) {
  if (!paymentMethodId.trim()) return Promise.reject(new Error('Payment method required'))
  // Never join captures using different methods; they represent distinct
  // financial instructions even when they target the same in-memory intent.
  return serialize(intent, `capture:${paymentMethodId}`, () => captureSaleInternal(intent, paymentMethodId, transport))
}
