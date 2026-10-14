import { describe, expect, it } from '@jest/globals'
import { isScopedTraceRow, relatedTraceRows, traceAmount, traceField } from '../order-trace'

const scope = { tenantId: 'tenant-a', organizationId: 'org-a' }
describe('read-only order lifecycle projection', () => {
  it('supports native snake_case and camelCase field projections', () => {
    expect(traceField({ order_id: 'a' }, 'orderId')).toBe('a')
    expect(traceField({ orderId: 'b' }, 'orderId')).toBe('b')
  })
  it('rejects any explicitly mismatched tenant or organization', () => {
    expect(isScopedTraceRow({ tenant_id: 'other' }, scope)).toBe(false)
    expect(isScopedTraceRow({ organizationId: 'other' }, scope)).toBe(false)
    expect(isScopedTraceRow({ tenantId: 'tenant-a', organizationId: 'org-a' }, scope)).toBe(true)
  })
  it('matches invoice/payment/shipment records only to their source order', () => {
    const items = [
      { order_id: 'order-1', tenant_id: 'tenant-a', organization_id: 'org-a' },
      { order_id: 'order-2' }, { orderId: 'order-1', organizationId: 'other' },
    ]
    for (const kind of ['invoice', 'payment', 'shipment', 'credit'] as const) {
      expect(relatedTraceRows(items, scope, 'order-1', kind)).toHaveLength(1)
    }
  })
  it('shows only WMS movements explicitly referenced to a sales order', () => {
    const items = [
      { reference_id: 'order-1', reference_type: 'so' },
      { reference_id: 'order-1', reference_type: 'po' },
      { reference_id: 'other', reference_type: 'so' },
      { reference_id: 'order-1', reference_type: 'so', tenant_id: 'foreign' },
    ]
    expect(relatedTraceRows(items, scope, 'order-1', 'movement')).toHaveLength(1)
  })
  it('does not fabricate missing, negative, or non-finite amounts', () => {
    expect(traceAmount('120.3000')).toBe(120.3)
    for (const value of [null, '', -1, 'NaN', 'Infinity', undefined]) expect(traceAmount(value)).toBeNull()
  })
})
