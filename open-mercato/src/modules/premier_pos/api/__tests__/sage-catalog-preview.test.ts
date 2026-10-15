import { beforeEach, expect, jest, test } from '@jest/globals'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolvePosScope } from '../../lib/serverScope'
import { GET, metadata } from '../sage-catalog-preview/route'

jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/core/modules/directory/utils/organizationScope', () => ({
  resolveOrganizationScopeForRequest: jest.fn(),
}))
jest.mock('@open-mercato/core/modules/directory/utils/organizationScopeFilter', () => ({
  resolveSingleOrganizationIdOrDeny: jest.fn(),
}))
jest.mock('../../lib/serverScope', () => {
  const actual = jest.requireActual<typeof import('../../lib/serverScope')>('../../lib/serverScope')
  return { ...actual, resolvePosScope: jest.fn() }
})

const tenant = '11111111-1111-4111-8111-111111111111'
const org = '22222222-2222-4222-8222-222222222222'
const productId = '33333333-3333-4333-8333-333333333333'
const variantId = '44444444-4444-4444-8444-444444444444'
const scoped = jest.mocked(resolvePosScope)
const req = (query = '') => new Request('https://example.invalid/api/premier_pos/sage-catalog-preview' + query)

function setScope() {
  const em = { find: jest.fn(async (_entity: unknown, where: unknown, _options: unknown) => {
    if ('product' in (where as Record<string, unknown>)) {
      return [{ id: variantId, product: { id: productId }, name: 'M',
        sku: 'TEE-M', barcode: 'ABC', isActive: true }]
    }
    return [{ id: productId, title: 'Tee', sku: 'TEE', isActive: true, productType: 'simple' }]
  }) }
  scoped.mockResolvedValue({ tenantId: tenant, organizationId: org,
    container: { resolve: () => em } } as unknown as Awaited<ReturnType<typeof resolvePosScope>>)
  return em
}
beforeEach(() => { jest.clearAllMocks() })

test('authenticated read-only catalog bridge uses official view-only permission', async () => {
  const em = setScope()
  const response = await GET(req('?pageSize=10&download=1'))
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('content-disposition')).toMatch(/attachment/)
  const data = await response.json()
  expect(data).toMatchObject({ readOnly: true, tenantId: tenant, organizationId: org,
    rows: [{ openMercatoProductId: productId, openMercatoVariantId: variantId, suggestedSku: 'TEE-M' }],
  })
  expect(em.find).toHaveBeenCalledWith(expect.anything(),
    { tenantId: tenant, organizationId: org, deletedAt: null },
    { fields: ['id', 'title', 'sku', 'productType', 'isActive'], orderBy: { id: 'ASC' }, limit: 11 })
  expect(em.find).toHaveBeenCalledWith(expect.anything(),
    { tenantId: tenant, organizationId: org, deletedAt: null, product: { $in: [productId] } },
    { fields: ['id', 'product', 'sku', 'name', 'barcode', 'isActive'], orderBy: { id: 'ASC' }, limit: 2001 })
  expect(metadata.GET.requireFeatures).toEqual(['catalog.products.view'])
})
test('rejects oversized, negative, malformed cursor and unexpected query parameters', async () => {
  const em = setScope()
  for (const query of ['?pageSize=101','?pageSize=-1','?pageSize=hello','?cursor=other','?tenantId=attacker','?pageSize=1.5']) {
    const response = await GET(req(query))
    expect(response.status).toBe(400)
  }
  expect(em.find).not.toHaveBeenCalled()
})
test('denies access when scoped auth fails before any database request', async () => {
  scoped.mockRejectedValue(new CrudHttpError(403, { error: 'Catalog view denied' }))
  const result = await GET(req())
  expect(result.status).toBe(403)
})

test('fails closed if a product page contains more than 2,000 variants', async () => {
  const em = setScope()
  em.find.mockImplementation(async (_entity: unknown, where: unknown) => {
    if ('product' in (where as Record<string, unknown>)) {
      return Array.from({ length: 2001 }, (_v, i) => ({
        id: 'variant-' + i, product: { id: productId }, name: 'Variant ' + i,
        sku: 'X-' + i, barcode: 'BAR-' + i, isActive: true,
      }))
    }
    return [{ id: productId, title: 'Multi-variant', sku: 'X', productType: 'configurable', isActive: true }]
  })
  const response = await GET(req())
  expect(response.status).toBe(413)
  expect((await response.json()).error).toMatch(/reduce pageSize/)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})
