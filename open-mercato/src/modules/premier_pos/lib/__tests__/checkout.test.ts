import { jest, test, expect } from '@jest/globals'
import { captureSale, saveOrder, readSavedOrder, type PosIntent, type PosTransport, type Row } from '../checkout'

jest.mock('@open-mercato/ui/backend/utils/crud', () => ({ createCrud: jest.fn(), fetchCrudList: jest.fn() }))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn() }))
const makeIntent = (): PosIntent => ({ reference: 'intent-a', tenantId: 'tenant-a', organizationId: 'org-a', channelId: 'channel-a', currencyCode: 'EGP', lines: [{ kind: 'product', name: 'Generic item', quantity: 2, currencyCode: 'EGP', unitPriceGross: 120 }] })
function fixture() {
  const rows: Record<string, Row[]> = { 'sales/orders': [], 'sales/invoices': [], 'sales/payments': [], 'sales/order-lines': [] }
  const calls: string[] = []
  let number = 0
  const transport: PosTransport = {
    number: jest.fn(async (kind: 'order' | 'invoice') => `${kind}-${++number}`),
    list: jest.fn(async (path: string) => ({ items: rows[path] ?? [] })),
    create: jest.fn(async (path: string, body: Row) => {
      calls.push(path)
      const id = `${path}-${calls.length}`
      rows[path].push({ ...body, id })
      if (path === 'sales/orders') {
        Object.assign(rows[path][0], { subtotalNetAmount: 200, subtotalGrossAmount: 240, discountTotalAmount: 0, taxTotalAmount: 40, grandTotalNetAmount: 200, grandTotalGrossAmount: 240, paidTotalAmount: 0, outstandingAmount: 240 })
        rows['sales/order-lines'] = [{ id: 'line-a', name: 'Generic item', quantity: 2, unitPriceNet: 100, unitPriceGross: 120, currencyCode: 'EGP', taxRate: 20, taxAmount: 40, totalNetAmount: 200, totalGrossAmount: 240 }]
      }
      if (path === 'sales/payments') Object.assign(rows['sales/orders'][0], { paidTotalAmount: 240, outstandingAmount: 0 })
      return { id }
    }),
  }
  return { transport, rows, calls }
}
test('uses one native order create containing all lines and scope; no independent line creates', async () => {
  const { transport, calls } = fixture(); const intent = makeIntent()
  const order = await saveOrder(intent, transport)
  expect(order.grandTotalGrossAmount).toBe(240)
  expect(calls).toEqual(['sales/orders'])
  expect(transport.create).toHaveBeenCalledWith('sales/orders', expect.objectContaining({ organizationId: 'org-a', tenantId: 'tenant-a', channelId: 'channel-a', lines: expect.any(Array) }))
})
test('concurrent submits join the same intent and capture once', async () => {
  const { transport, calls } = fixture(); const intent = makeIntent()
  const orders = await Promise.all([captureSale(intent, 'cash', transport), captureSale(intent, 'cash', transport)])
  expect(orders.map((order) => order.outstandingAmount)).toEqual([0, 0])
  expect(calls).toEqual(['sales/orders', 'sales/invoices', 'sales/payments'])
})
test('a paid intent cannot be captured twice', async () => {
  const { transport, calls } = fixture(); const intent = makeIntent()
  await captureSale(intent, 'cash', transport); await captureSale(intent, 'cash', transport)
  expect(calls.filter((path) => path === 'sales/payments')).toHaveLength(1)
})
test('lost order response recovers the scoped external reference without repeating create', async () => {
  const f = fixture(); const original = f.transport.create
  f.transport.create = async (path, body) => { const result = await original(path, body); if (path === 'sales/orders') throw new Error('Response lost'); return result }
  const intent = makeIntent(); await saveOrder(intent, f.transport)
  expect(intent.orderId).toBeDefined(); expect(f.calls).toEqual(['sales/orders'])
})
test('uncertain payment is never repeated while no saved capture can be found', async () => {
  const f = fixture(); const original = f.transport.create
  f.transport.create = async (path, body) => { if (path === 'sales/payments') { f.calls.push(path); throw new Error('Network lost') }; return original(path, body) }
  const intent = makeIntent()
  await expect(captureSale(intent, 'cash', f.transport)).rejects.toThrow('POS_PAYMENT_UNCERTAIN')
  expect(intent.orderId).toBeDefined(); expect(intent.invoiceId).toBeDefined()
  await expect(captureSale(intent, 'cash', f.transport)).rejects.toThrow('POS_PAYMENT_UNCERTAIN')
  expect(f.calls.filter((path) => path === 'sales/payments')).toHaveLength(1)
})
test('a saved capture with lost response is reconciled from the server', async () => {
  const f = fixture(); const original = f.transport.create
  f.transport.create = async (path, body) => { const result = await original(path, body); if (path === 'sales/payments') throw new Error('Response lost'); return result }
  const intent = makeIntent()
  await expect(captureSale(intent, 'cash', f.transport)).rejects.toThrow('POS_PAYMENT_UNCERTAIN')
  const order = await captureSale(intent, 'cash', f.transport)
  expect(order.outstandingAmount).toBe(0); expect(f.calls.filter((path) => path === 'sales/payments')).toHaveLength(1)
})
test('cross-organization or currency readback blocks checkout', async () => {
  const f = fixture(); const intent = makeIntent(); await saveOrder(intent, f.transport)
  f.rows['sales/orders'][0].organizationId = 'foreign-org'
  await expect(readSavedOrder(intent, f.transport)).rejects.toThrow('scope or reference changed')
  await expect(captureSale(intent, 'cash', f.transport)).rejects.toThrow()
  expect(f.calls).toEqual(['sales/orders'])
})
test('failed invoice leaves the order available and prevents capture', async () => {
  const f = fixture(); const original = f.transport.create
  f.transport.create = async (path, body) => { if (path === 'sales/invoices') throw new Error('Invoice unavailable'); return original(path, body) }
  const intent = makeIntent()
  await expect(captureSale(intent, 'cash', f.transport)).rejects.toThrow('POS_INVOICE_UNCERTAIN')
  expect(intent.orderId).toBeDefined(); expect(f.calls).toEqual(['sales/orders'])
})
test('invoice copies saved amounts and quantities instead of recomputing financial totals', async () => {
  const f = fixture(); const intent = makeIntent(); await captureSale(intent, 'cash', f.transport)
  expect(f.transport.create).toHaveBeenCalledWith('sales/invoices', expect.objectContaining({ grandTotalGrossAmount: 240, taxTotalAmount: 40, lines: [expect.objectContaining({ orderLineId: 'line-a', totalGrossAmount: 240, quantity: 2 })] }))
  expect(f.transport.create).toHaveBeenCalledWith('sales/payments', expect.objectContaining({ amount: 240, capturedAmount: 240, allocations: [expect.objectContaining({ orderId: intent.orderId, invoiceId: intent.invoiceId, amount: 240 })] }))
})

test('payment recovery rejects a matching reference from a different organization without recapturing', async () => {
  const f = fixture()
  const intent = makeIntent()
  await captureSale(intent, 'cash', f.transport)
  const created = f.calls.filter((path) => path === 'sales/payments').length
  f.rows['sales/payments'][0].organizationId = 'foreign-org'
  f.rows['sales/orders'][0].outstandingAmount = 240
  intent.paymentId = undefined
  await expect(captureSale(intent, 'cash', f.transport)).rejects.toThrow('POS_PAYMENT_UNCERTAIN')
  expect(f.calls.filter((path) => path === 'sales/payments')).toHaveLength(created)
})
test('payment recovery rejects an altered amount without posting twice', async () => {
  const f = fixture()
  const intent = makeIntent()
  await captureSale(intent, 'cash', f.transport)
  f.rows['sales/payments'][0].amount = 1
  f.rows['sales/orders'][0].outstandingAmount = 240
  intent.paymentId = undefined
  await expect(captureSale(intent, 'cash', f.transport)).rejects.toThrow('POS_PAYMENT_UNCERTAIN')
  expect(f.calls.filter((path) => path === 'sales/payments')).toHaveLength(1)
})

test('invoice recovery cannot reuse a document from a foreign organization', async () => {
  const f = fixture()
  const intent = makeIntent()
  await captureSale(intent, 'cash', f.transport)
  f.rows['sales/invoices'][0].organizationId = 'foreign-org'
  intent.invoiceId = undefined
  await expect(captureSale(intent, 'cash', f.transport)).rejects.toThrow('POS_INVOICE_UNCERTAIN')
  expect(f.calls.filter((path) => path === 'sales/invoices')).toHaveLength(1)
})
