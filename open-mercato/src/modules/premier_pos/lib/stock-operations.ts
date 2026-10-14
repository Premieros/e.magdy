/**
 * Explicit operator actions over Open Mercato's canonical WMS commands.
 * No shadow movement tables and no inference that Sales payments ship stock.
 */
export type StockOperation = 'receive' | 'adjust' | 'move' | 'cycleCount'
export type StockScope = Readonly<{
  tenantId: string
  organizationId: string
  performedBy: string
}>
export type StockRow = Record<string, unknown>
export type StockDraft = Readonly<{
  operation: StockOperation
  warehouseId: string
  catalogVariantId: string
  locationId: string
  toLocationId: string
  quantity: string
  reason: string
  lotNumber: string
  lotId: string
  serialNumber: string
}>
export type StockContext = Readonly<{
  warehouses: readonly StockRow[]
  locations: readonly StockRow[]
  variants: readonly StockRow[]
  lots?: readonly StockRow[]
}>
export const STOCK_COMMANDS: Record<StockOperation, string> = {
  receive: '/api/wms/inventory/receive',
  adjust: '/api/wms/inventory/adjust',
  move: '/api/wms/inventory/move',
  cycleCount: '/api/wms/inventory/cycle-count',
}
export const STOCK_PERMISSIONS: Record<StockOperation, string> = {
  receive: 'wms.receive_inventory',
  adjust: 'wms.adjust_inventory',
  move: 'wms.adjust_inventory',
  cycleCount: 'wms.cycle_count',
}
export const STOCK_OPERATIONS: readonly StockOperation[] = ['receive', 'adjust', 'move', 'cycleCount']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_QUANTITY = 1_000_000_000

export function isStockUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}
export function stockField(row: StockRow, camelName: string): unknown {
  return row[camelName] ?? row[camelName.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)] ?? null
}
function inScope(row: StockRow, scope: StockScope): boolean {
  const tenant = stockField(row, 'tenantId')
  const organization = stockField(row, 'organizationId')
  const deleted = stockField(row, 'deletedAt')
  return (tenant == null || tenant === scope.tenantId) &&
    (organization == null || organization === scope.organizationId) &&
    stockField(row, 'isActive') !== false && deleted == null
}
export function stockRowsForScope(rows: readonly StockRow[], scope: StockScope): StockRow[] {
  return rows.filter(row => inScope(row, scope))
}
export function stockRowsForWarehouse(
  rows: readonly StockRow[], scope: StockScope, warehouseId: string,
): StockRow[] {
  return stockRowsForScope(rows, scope)
    .filter(row => stockField(row, 'warehouseId') === warehouseId)
}

function validateNumber(text: string, operation: StockOperation): number {
  if (!/^-?(?:\d+)(?:\.\d{1,6})?$/.test(text.trim())) {
    throw new Error('Enter a valid quantity with no more than six decimals')
  }
  const value = Number(text)
  if (!Number.isFinite(value) || Math.abs(value) > MAX_QUANTITY) throw new Error('Quantity out of range')
  if (operation === 'cycleCount' && value < 0) throw new Error('Count cannot be negative')
  if (operation === 'adjust' && value === 0) throw new Error('Adjustment cannot be zero')
  if ((operation === 'receive' || operation === 'move') && value <= 0) {
    throw new Error('Quantity must be positive')
  }
  return value
}

export function buildStockCommand(
  draft: StockDraft, scope: StockScope, referenceId: string, context: StockContext,
): { path: string; body: Record<string, unknown> } {
  if (!isStockUuid(scope.tenantId) || !isStockUuid(scope.organizationId) ||
      !isStockUuid(scope.performedBy) || !isStockUuid(referenceId)) {
    throw new Error('Authenticated scope and stable operation reference are required')
  }
  if (!STOCK_OPERATIONS.includes(draft.operation)) throw new Error('Unknown inventory operation')
  if (!isStockUuid(draft.warehouseId) || !isStockUuid(draft.catalogVariantId)) {
    throw new Error('Select a valid warehouse and SKU')
  }
  if (!stockRowsForScope(context.warehouses, scope).some(row => row.id === draft.warehouseId)) {
    throw new Error('Warehouse not available in the selected organization')
  }
  if (!stockRowsForScope(context.variants, scope).some(row => row.id === draft.catalogVariantId)) {
    throw new Error('SKU is not available in the selected organization')
  }
  const locations = stockRowsForWarehouse(context.locations, scope, draft.warehouseId)
  if (!isStockUuid(draft.locationId) || !locations.some(row => row.id === draft.locationId)) {
    throw new Error('Location does not belong to selected warehouse')
  }
  const quantity = validateNumber(draft.quantity, draft.operation)
  const reason = draft.reason.trim()
  if (reason.length > 500) throw new Error('Reason exceeds 500 characters')
  if (draft.operation !== 'receive' && reason.length === 0) {
    throw new Error('An audit reason is required')
  }
  const lotNumber = draft.lotNumber.trim()
  const serialNumber = draft.serialNumber.trim()
  if (lotNumber.length > 120 || serialNumber.length > 120) {
    throw new Error('Lot or serial number is too long')
  }
  if (draft.lotId) {
    if (!isStockUuid(draft.lotId) || !stockRowsForScope(context.lots ?? [], scope).some(
      row => row.id === draft.lotId && stockField(row, 'catalogVariantId') === draft.catalogVariantId,
    )) throw new Error('Lot does not belong to selected SKU and organization')
  }
  if (draft.operation === 'move') {
    if (!isStockUuid(draft.toLocationId) ||
        !locations.some(row => row.id === draft.toLocationId) ||
        draft.toLocationId === draft.locationId) {
      throw new Error('Choose a different destination in the same warehouse')
    }
  }

  const base = {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    warehouseId: draft.warehouseId,
    catalogVariantId: draft.catalogVariantId,
    referenceType: 'manual',
    referenceId,
    performedBy: scope.performedBy,
    ...(draft.lotId ? { lotId: draft.lotId } : {}),
  }
  let body: Record<string, unknown>
  switch (draft.operation) {
    case 'receive':
      body = { ...base, locationId: draft.locationId, quantity,
        ...(reason ? { reason } : {}),
        ...(!draft.lotId && lotNumber ? { lotNumber } : {}), ...(serialNumber ? { serialNumber } : {}) }
      break
    case 'adjust':
      body = { ...base, locationId: draft.locationId, delta: quantity, reason,
        ...(serialNumber ? { serialNumber } : {}) }
      break
    case 'move':
      body = { ...base, fromLocationId: draft.locationId, toLocationId: draft.toLocationId,
        quantity, reason, ...(serialNumber ? { serialNumber } : {}) }
      break
    case 'cycleCount':
      body = { ...base, locationId: draft.locationId, countedQuantity: quantity,
        autoAdjust: true, reason, ...(serialNumber ? { serialNumber } : {}) }
      break
  }
  return { path: STOCK_COMMANDS[draft.operation], body }
}

/** Conservative reconciliation, never claiming absence proves no posting. */
export function matchingStockMovements(
  rows: readonly StockRow[], scope: StockScope, referenceId: string, draft: StockDraft,
): StockRow[] {
  return stockRowsForScope(rows, scope).filter(row =>
    stockField(row, 'referenceType') === 'manual' &&
    stockField(row, 'referenceId') === referenceId &&
    stockField(row, 'warehouseId') === draft.warehouseId &&
    stockField(row, 'catalogVariantId') === draft.catalogVariantId,
  )
}

export function stockQuantity(row: StockRow, field: string): number | null {
  const raw = stockField(row, field)
  if ((typeof raw !== 'string' && typeof raw !== 'number') || String(raw).trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}
