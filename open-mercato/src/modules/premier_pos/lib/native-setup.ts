/**
 * Fixed, auditable starter records for a developer-owned PremierOS organization.
 * These go through official Open Mercato REST endpoints and permission checks.
 * No automatic writes, no SQL, no orders, no money and no inventory postings.
 */
export type NativeSetupKind = 'currency' | 'channel' | 'paymentMethod' | 'warehouse' | 'location'
export type NativeSetupScope = Readonly<{ tenantId: string; organizationId: string }>
export type NativeSetupRow = Record<string, unknown>

export const NATIVE_SETUP_ROUTES: Record<NativeSetupKind, string> = {
  currency: '/api/currencies/currencies',
  channel: '/api/sales/channels',
  paymentMethod: '/api/sales/payment-methods',
  warehouse: '/api/wms/warehouses',
  location: '/api/wms/locations',
}

export const NATIVE_SETUP_CODES: Record<NativeSetupKind, string> = {
  currency: 'EGP',
  channel: 'dev_test_pos',
  paymentMethod: 'dev_test_manual',
  warehouse: 'DEV-TEST-WH',
  location: 'DEV-TEST-DOCK',
}

function nonEmptyUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function requireNativeSetupScope(scope: NativeSetupScope): void {
  if (!nonEmptyUuid(scope.tenantId) || !nonEmptyUuid(scope.organizationId)) {
    throw new Error('Valid tenant and organization must be selected')
  }
}

export function setupRowField(row: NativeSetupRow, field: string): unknown {
  const snake = field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  return row[field] ?? row[snake] ?? null
}

export function availableSetupRows(rows: readonly NativeSetupRow[], scope: NativeSetupScope): NativeSetupRow[] {
  requireNativeSetupScope(scope)
  return rows.filter((row) => {
    const tenant = setupRowField(row, 'tenantId')
    const org = setupRowField(row, 'organizationId')
    const active = setupRowField(row, 'isActive')
    const deleted = setupRowField(row, 'deletedAt')
    return (tenant === null || tenant === scope.tenantId) &&
      (org === null || org === scope.organizationId) &&
      active !== false && deleted === null
  })
}

export function hasConfiguredSetup(
  kind: NativeSetupKind, rows: readonly NativeSetupRow[], scope: NativeSetupScope, warehouseId?: string,
): boolean {
  const available = availableSetupRows(rows, scope)
  if (kind !== 'location') return available.length > 0
  if (!nonEmptyUuid(warehouseId)) return false
  return available.some((row) => setupRowField(row, 'warehouseId') === warehouseId)
}

export function buildNativeSetupRequest(kind: NativeSetupKind, scope: NativeSetupScope, warehouseId?: string) {
  requireNativeSetupScope(scope)
  const base = { tenantId: scope.tenantId, organizationId: scope.organizationId }
  const path = NATIVE_SETUP_ROUTES[kind]
  switch (kind) {
    case 'currency':
      return { path, body: { ...base, code: 'EGP', name: 'Egyptian Pound', symbol: 'EGP', decimalPlaces: 2, isBase: true, isActive: true } }
    case 'channel':
      return { path, body: { ...base, name: 'DEV TEST - PremierOS POS', code: 'dev_test_pos', description: 'Development-only sales channel', isActive: true } }
    case 'paymentMethod':
      return { path, body: { ...base, name: 'DEV TEST - Manual Payment', code: 'dev_test_manual', description: 'No external gateway. Development-only payment method.', isActive: true } }
    case 'warehouse':
      return { path, body: { ...base, name: 'DEV TEST - Warehouse', code: 'DEV-TEST-WH', isPrimary: false, isActive: true } }
    case 'location':
      if (!nonEmptyUuid(warehouseId)) throw new Error('A valid warehouse must be selected before adding a location')
      return { path, body: { ...base, warehouseId, code: 'DEV-TEST-DOCK', type: 'dock', isActive: true } }
  }
}
