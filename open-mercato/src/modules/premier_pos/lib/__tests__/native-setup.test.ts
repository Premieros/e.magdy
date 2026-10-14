import { describe, expect, it } from '@jest/globals'
import {
  availableSetupRows, buildNativeSetupRequest, hasConfiguredSetup,
  NATIVE_SETUP_CODES, NATIVE_SETUP_ROUTES, type NativeSetupKind,
} from '../native-setup'

const scope = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
}
const warehouseId = '33333333-3333-4333-8333-333333333333'

describe('native setup safety', () => {
  it('only targets official configuration CRUD endpoints with scoped payloads', () => {
    const kinds: NativeSetupKind[] = ['currency', 'channel', 'paymentMethod', 'warehouse', 'location']
    for (const kind of kinds) {
      const request = buildNativeSetupRequest(kind, scope, warehouseId)
      expect(request.path).toBe(NATIVE_SETUP_ROUTES[kind])
      expect(request.body).toEqual(expect.objectContaining(scope))
    }
  })
  it('uses a standard EGP base currency and manual tender', () => {
    expect(buildNativeSetupRequest('currency', scope).body)
      .toMatchObject({ code: 'EGP', isBase: true, isActive: true })
    expect(buildNativeSetupRequest('paymentMethod', scope).body)
      .toMatchObject({ code: 'dev_test_manual', isActive: true })
    expect(buildNativeSetupRequest('paymentMethod', scope).body).not.toHaveProperty('providerKey')
  })
  it('requires a warehouse before proposing a receiving dock', () => {
    expect(() => buildNativeSetupRequest('location', scope)).toThrow()
    expect(buildNativeSetupRequest('location', scope, warehouseId))
      .toMatchObject({ path: '/api/wms/locations', body: { warehouseId, code: NATIVE_SETUP_CODES.location, type: 'dock' } })
  })
  it('fails closed without tenant and organization IDs', () => {
    expect(() => buildNativeSetupRequest('currency', { ...scope, tenantId: '' })).toThrow()
    expect(() => buildNativeSetupRequest('warehouse', { ...scope, organizationId: 'invalid' })).toThrow()
  })
  it('filters inactive and foreign-scope rows', () => {
    const rows = [
      { id: 'a', code: 'dev_test_pos', tenant_id: scope.tenantId, organization_id: scope.organizationId, is_active: true },
      { id: 'b', organization_id: 'other' },
      { id: 'c', tenantId: 'other' },
      { id: 'd', isActive: false },
      { id: 'e', deleted_at: '2026-01-01' },
    ]
    expect(availableSetupRows(rows, scope)).toEqual([rows[0]])
    expect(hasConfiguredSetup('channel', rows, scope)).toBe(true)
    expect(hasConfiguredSetup('channel', rows.slice(1), scope)).toBe(false)
    expect(hasConfiguredSetup('channel', [{ ...rows[0], code: 'other' }], scope)).toBe(false)
  })
  it('requires the selected warehouse for location readiness', () => {
    const matching = { warehouse_id: warehouseId, code: 'DEV-TEST-DOCK', is_active: true }
    const other = { warehouse_id: '44444444-4444-4444-8444-444444444444', code: 'DEV-TEST-DOCK', is_active: true }
    expect(hasConfiguredSetup('location', [matching, other], scope, warehouseId)).toBe(true)
    expect(hasConfiguredSetup('location', [other], scope, warehouseId)).toBe(false)
    expect(hasConfiguredSetup('location', [matching], scope)).toBe(false)
    expect(hasConfiguredSetup('currency', [{ code: 'USD' }], scope)).toBe(false)
    expect(hasConfiguredSetup('currency', [{ code: 'EGP' }], scope)).toBe(true)
  })
})
