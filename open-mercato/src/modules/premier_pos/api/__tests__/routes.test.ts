import { jest, test, expect, beforeEach } from '@jest/globals'
import { DefaultSalesCalculationService } from '@open-mercato/core/modules/sales/services/salesCalculationService'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolvePosScope } from '../../lib/serverScope'
import { POST as preview } from '../preview/route'
import { POST as number } from '../number/route'
import { GET as methods } from '../payment-methods/route'
import { GET as currencyOptions, metadata as currencyMetadata } from '../currency-options/route'

jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/core/modules/directory/utils/organizationScope', () => ({ resolveOrganizationScopeForRequest: jest.fn() }))
jest.mock('@open-mercato/core/modules/directory/utils/organizationScopeFilter', () => ({ resolveSingleOrganizationIdOrDeny: jest.fn() }))

jest.mock('../../lib/serverScope', () => {
  const actual = jest.requireActual<typeof import('../../lib/serverScope')>('../../lib/serverScope')
  return { ...actual, resolvePosScope: jest.fn() }
})
const tenant = '11111111-1111-4111-8111-111111111111', org = '22222222-2222-4222-8222-222222222222', channel = '33333333-3333-4333-8333-333333333333'
const request = (body: unknown) => new Request('https://example.invalid/api/premier_pos/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const cart = () => ({ expectedTenantId: tenant, expectedOrganizationId: org, channelId: channel, currencyCode: 'EGP', lines: [{ kind: 'service', name: 'Generic service', currencyCode: 'EGP', quantity: 2, unitPriceGross: 120, taxRate: 20, discountPercent: 10 }] })
const scoped = jest.mocked(resolvePosScope)
function scope() {
  const em = { findOne: jest.fn(async (_entity: unknown, where: unknown, _options: unknown) => 'code' in (where as Record<string, unknown>) ? { code: 'EGP' } : { id: channel }), find: jest.fn(async (_entity: unknown, _where: unknown, _options: unknown) => [{ id: channel, name: 'Cash', code: 'cash' }]) }
  const calc = new DefaultSalesCalculationService()
  const calculate = jest.spyOn(calc, 'calculateDocumentTotals')
  const generator = { generate: jest.fn(async (_input: unknown) => ({ number: 'NATIVE-1' })) }
  scoped.mockResolvedValue({ tenantId: tenant, organizationId: org, container: { resolve: (name: string) => name === 'em' ? em : name === 'salesCalculationService' ? calc : generator } } as unknown as Awaited<ReturnType<typeof resolvePosScope>>)
  return { em, calculate, generator }
}
beforeEach(() => { jest.clearAllMocks() })
test('authenticated scoped preview delegates VAT and discount to the installed engine', async () => {
  const f = scope(); const response = await preview(request(cart())); const body = await response.json()
  expect(response.status).toBe(200)
  expect(body.totals.grandTotalGrossAmount).toBe(216)
  expect(body.totals.taxTotalAmount).toBe(36)
  expect(f.calculate).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ tenantId: tenant, organizationId: org }) }))
  expect(f.em.findOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId: tenant, organizationId: org, id: channel }), expect.anything())
})
test('scope changes are rejected before financial calculation', async () => {
  const f = scope(); const response = await preview(request({ ...cart(), expectedOrganizationId: channel }))
  expect(response.status).toBe(409); expect(f.calculate).not.toHaveBeenCalled()
})
test('a channel outside current scope cannot price a sale', async () => {
  const f = scope(); f.em.findOne.mockResolvedValue(null as never)
  expect((await preview(request(cart()))).status).toBe(403); expect(f.calculate).not.toHaveBeenCalled()
})
test('missing price, zero quantity, extra tenant scope and malformed carts are rejected', async () => {
  scope()
  for (const body of [ { ...cart(), tenantId: channel }, { ...cart(), lines: [{ currencyCode: 'EGP', quantity: 1 }] }, { ...cart(), lines: [{ currencyCode: 'EGP', quantity: 0, unitPriceGross: 20 }] }, { ...cart(), lines: [] } ]) expect((await preview(request(body))).status).toBe(400)
})
test('automatic numbering rejects caller formats and derives scope', async () => {
  const f = scope()
  const body = { kind: 'order', expectedTenantId: tenant, expectedOrganizationId: org }
  expect((await number(request({ ...body, number: 'OVERRIDE' }))).status).toBe(400)
  expect((await number(request(body))).status).toBe(200)
  expect(f.generator.generate).toHaveBeenCalledWith({ kind: 'order', tenantId: tenant, organizationId: org })
})
test('payment lookup exposes only manual method labels in current scope', async () => {
  const f = scope(); const response = await methods(new Request('https://example.invalid/api/premier_pos/payment-methods'))
  expect(response.status).toBe(200)
  expect(f.em.find).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ organizationId: org, tenantId: tenant, isActive: true, providerKey: null }), expect.objectContaining({ fields: ['id', 'name', 'code'], limit: 100 }))
})
test('no authenticated context is not widened to system scope', async () => {
  scoped.mockRejectedValue(new CrudHttpError(401, { error: 'Authentication required' }))
  expect((await preview(request(cart()))).status).toBe(401)
  expect((await number(request({ kind: 'order', expectedTenantId: tenant, expectedOrganizationId: org }))).status).toBe(401)
  expect((await methods(new Request('https://example.invalid'))).status).toBe(401)
})

test('cashier currency selector uses native active currencies scoped to one organization', async () => {
  const f = scope()
  f.em.find.mockResolvedValue([{ code: 'EGP', name: 'Egyptian Pound' }, { code: 'USD', name: 'US Dollar' }] as never)
  const response = await currencyOptions(new Request('https://example.invalid/api/premier_pos/currency-options'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    items: [{ value: 'EGP', label: 'EGP - Egyptian Pound' }, { value: 'USD', label: 'USD - US Dollar' }],
  })
  expect(f.em.find).toHaveBeenCalledWith(expect.anything(),
    { tenantId: tenant, organizationId: org, isActive: true, deletedAt: null },
    { fields: ['code', 'name'], orderBy: { code: 'ASC' }, limit: 100 })
  expect(currencyMetadata.GET.requireFeatures).toEqual(['sales.orders.manage'])
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})
test('currency options deny missing authentication before reading native currencies', async () => {
  scoped.mockRejectedValue(new CrudHttpError(401, { error: 'Authentication required' }))
  const response = await currencyOptions(new Request('https://example.invalid/api/premier_pos/currency-options'))
  expect(response.status).toBe(401)
})

test('preview refuses currency not active in this organization without calculation', async () => {
  const f = scope()
  f.em.findOne.mockResolvedValueOnce({ id: channel }).mockResolvedValueOnce(null as never)
  const response = await preview(request(cart()))
  expect(response.status).toBe(403)
  expect(f.calculate).not.toHaveBeenCalled()
})
test('preview checks official currency scope before computing totals', async () => {
  const f = scope()
  expect((await preview(request(cart()))).status).toBe(200)
  expect(f.em.findOne).toHaveBeenCalledWith(expect.anything(), {
    code: 'EGP', tenantId: tenant, organizationId: org, deletedAt: null, isActive: true,
  }, { fields: ['code'] })
})
