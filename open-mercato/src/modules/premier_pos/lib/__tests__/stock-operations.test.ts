import { describe, expect, it } from '@jest/globals'
import {
  buildStockCommand, matchingStockMovements, stockQuantity,
  stockRowsForScope, stockRowsForWarehouse, STOCK_COMMANDS, STOCK_PERMISSIONS,
  type StockDraft, type StockScope, type StockContext, type StockOperation,
} from '../stock-operations'

const scope: StockScope = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  performedBy: '33333333-3333-4333-8333-333333333333',
}
const warehouseId = '44444444-4444-4444-8444-444444444444'
const locationId = '55555555-5555-4555-8555-555555555555'
const toLocationId = '66666666-6666-4666-8666-666666666666'
const catalogVariantId = '77777777-7777-4777-8777-777777777777'
const referenceId = '88888888-8888-4888-8888-888888888888'
const draft: StockDraft = {
  operation: 'receive', warehouseId, catalogVariantId, locationId, toLocationId,
  quantity: '5.25', reason: 'Warehouse test receiving', lotNumber: '', lotId: '', serialNumber: '',
}
const context: StockContext = {
  warehouses: [{ id: warehouseId, tenant_id: scope.tenantId, organization_id: scope.organizationId, is_active: true }],
  locations: [
    { id: locationId, warehouse_id: warehouseId, organization_id: scope.organizationId, is_active: true },
    { id: toLocationId, warehouse_id: warehouseId, organization_id: scope.organizationId, is_active: true },
  ],
  variants: [{ id: catalogVariantId, organizationId: scope.organizationId, tenantId: scope.tenantId, isActive: true }],
}
const build = (d: StockDraft = draft, ctx: StockContext = context, ref = referenceId) =>
  buildStockCommand(d, scope, ref, ctx)

describe('native WMS operator commands', () => {
  it('restricts writes to native WMS commands with their documented permissions', () => {
    expect(STOCK_COMMANDS).toEqual({
      receive: '/api/wms/inventory/receive',
      adjust: '/api/wms/inventory/adjust',
      move: '/api/wms/inventory/move',
      cycleCount: '/api/wms/inventory/cycle-count',
    })
    expect(STOCK_PERMISSIONS.receive).toBe('wms.receive_inventory')
    expect(STOCK_PERMISSIONS.cycleCount).toBe('wms.cycle_count')
  })
  it('builds a scoped receipt with stable reference and no stock tables of its own', () => {
    expect(build()).toMatchObject({
      path: STOCK_COMMANDS.receive,
      body: {
        tenantId: scope.tenantId, organizationId: scope.organizationId,
        performedBy: scope.performedBy, warehouseId, locationId, catalogVariantId,
        quantity: 5.25, referenceType: 'manual', referenceId,
      },
    })
    expect(build().body).not.toHaveProperty('delta')
    expect(build({ ...draft, lotNumber: 'BATCH-A', serialNumber: 'SERIAL-X' }).body)
      .toMatchObject({ lotNumber: 'BATCH-A', serialNumber: 'SERIAL-X' })
  })
  it('builds signed adjustment and rejects zero, missing reason or excessive amounts', () => {
    const row = { ...draft, operation: 'adjust' as const, quantity: '-2.5' }
    expect(build(row)).toMatchObject({
      path: STOCK_COMMANDS.adjust, body: { delta: -2.5, reason: draft.reason },
    })
    for (const quantity of ['0', '', 'Infinity', 'NaN', '0.0000001', '1000000001', '5abc']) {
      expect(() => build({ ...row, quantity })).toThrow()
    }
    expect(() => build({ ...row, reason: '' })).toThrow('reason')
  })
  it('moves positive amounts strictly between distinct locations of same warehouse', () => {
    const row = { ...draft, operation: 'move' as const }
    expect(build(row)).toMatchObject({
      path: STOCK_COMMANDS.move, body: {
        fromLocationId: locationId, toLocationId, quantity: 5.25, referenceType: 'manual',
      },
    })
    expect(() => build({ ...row, toLocationId: locationId })).toThrow('different destination')
    expect(() => build({ ...row, toLocationId: referenceId })).toThrow('different destination')
    expect(() => build({ ...row, quantity: '-3' })).toThrow('positive')
  })
  it('performs count reconciliation with zero allowed, never negative', () => {
    const row = { ...draft, operation: 'cycleCount' as const, quantity: '0' }
    expect(build(row)).toMatchObject({
      path: STOCK_COMMANDS.cycleCount,
      body: { countedQuantity: 0, autoAdjust: true, referenceType: 'manual' },
    })
    expect(() => build({ ...row, quantity: '-1' })).toThrow('negative')
    expect(() => build({ ...row, reason: ' ' })).toThrow('reason')
  })
  it('rejects wrong org/tenant or inactive warehouse, location and variant', () => {
    const wrongTenant: StockContext = {
      ...context, warehouses: [{ ...context.warehouses[0], tenant_id: referenceId }],
    }
    expect(() => build(draft, wrongTenant)).toThrow('Warehouse')
    const wrongLocation = { ...context, locations: [
      { ...context.locations[0], warehouse_id: referenceId },
    ] }
    expect(() => build(draft, wrongLocation)).toThrow('Location')
    const wrongSku = { ...context, variants: [
      { ...context.variants[0], isActive: false },
    ] }
    expect(() => build(draft, wrongSku)).toThrow('SKU')
    expect(() => build(draft, context, 'not-uuid')).toThrow('scope')
  })
  it('filters disabled or foreign scope rows for an accurate UI', () => {
    const foreign = { ...context.locations[0], organization_id: referenceId }
    expect(stockRowsForWarehouse([context.locations[0], foreign], scope, warehouseId))
      .toHaveLength(1)
    expect(stockRowsForScope([context.warehouses[0], { ...context.warehouses[0], is_active: false }], scope))
      .toHaveLength(1)
  })
  it('only matches posted movements with exact source reference, SKU and warehouse', () => {
    const good = {
      reference_type: 'manual', reference_id: referenceId,
      warehouse_id: warehouseId, catalog_variant_id: catalogVariantId,
      organization_id: scope.organizationId, tenant_id: scope.tenantId,
    }
    const badKeys = ['reference_type', 'reference_id', 'warehouse_id',
      'catalog_variant_id', 'organization_id', 'tenant_id'] as const
    const rows = [good, ...badKeys.map(key => ({ ...good, [key]: 'different' }))]
    expect(matchingStockMovements(rows, scope, referenceId, draft)).toEqual([good])
  })
  it('does not invent stock quantities for missing or invalid values', () => {
    expect(stockQuantity({ quantity_on_hand: '12.7500' }, 'quantityOnHand')).toBe(12.75)
    for (const value of ['', 'NaN', Infinity, undefined, null]) {
      expect(stockQuantity({ quantity_on_hand: value }, 'quantityOnHand')).toBeNull()
    }
  })
  it('refuses bogus methods and invalid numbers', () => {
    expect(() => build({ ...draft, operation: 'refund' as StockOperation })).toThrow('Unknown')
    for (const quantity of ['-0.5', '1e3']) {
      expect(() => build({ ...draft, quantity })).toThrow()
    }
    expect(() => build({ ...draft, reason: 'x'.repeat(501) })).toThrow('Reason')
  })
})
