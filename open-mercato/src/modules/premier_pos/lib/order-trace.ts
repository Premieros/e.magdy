/**
 * Read-only projection of Open Mercato records.
 * Never derives new financial/inventory balances or equates paid with shipped.
 */
export type TraceRow = Record<string, unknown>
export type TraceScope = Readonly<{ tenantId: string; organizationId: string }>

export function traceField(row: TraceRow, camel: string): unknown {
  const snake = camel.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  return row[camel] ?? row[snake] ?? null
}
export function isScopedTraceRow(row: TraceRow, scope: TraceScope): boolean {
  // Official CRUD may omit scope columns from projected lists. If supplied,
  // scope fields must agree; server authorization remains the source of truth.
  const tenant = traceField(row, 'tenantId')
  const org = traceField(row, 'organizationId')
  return (tenant == null || tenant === scope.tenantId) &&
    (org == null || org === scope.organizationId)
}
export function relatedTraceRows(
  items: readonly TraceRow[],
  scope: TraceScope,
  orderId: string,
  kind: 'invoice' | 'payment' | 'shipment' | 'movement',
): TraceRow[] {
  return items.filter((row) => {
    if (!isScopedTraceRow(row, scope)) return false
    if (kind === 'movement') {
      return traceField(row, 'referenceId') === orderId && traceField(row, 'referenceType') === 'so'
    }
    return traceField(row, 'orderId') === orderId
  })
}
export function traceAmount(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  if (String(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}
export function traceLabel(row: TraceRow, field: string): string {
  const value = traceField(row, field)
  return typeof value === 'string' && value.trim().length ? value : '—'
}
