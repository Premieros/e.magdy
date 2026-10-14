import { describe, expect, it } from '@jest/globals'
import {
  buildCatalogSetupRequest, matchingCatalogRows, CATALOG_SETUP_STAGES,
  CATALOG_SETUP_ROUTES, CATALOG_STARTER,
} from '../native-catalog-setup'
import type { NativeSetupScope } from '../native-setup'

const scope: NativeSetupScope = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
}
const ids = {
  product: '33333333-3333-4333-8333-333333333333',
  variant: '44444444-4444-4444-8444-444444444444',
  priceKind: '55555555-5555-4555-8555-555555555555',
  offer: '66666666-6666-4666-8666-666666666666',
  channel: '77777777-7777-4777-8777-777777777777',
}

describe('native catalog sample setup', () => {
  it('uses the five official catalog CRUD endpoints', () => {
    expect(CATALOG_SETUP_STAGES).toEqual(['product', 'variant', 'priceKind', 'offer', 'price'])
    for (const stage of CATALOG_SETUP_STAGES) {
      const request = buildCatalogSetupRequest(stage, scope, ids)
      expect(request.path).toBe(CATALOG_SETUP_ROUTES[stage])
      expect(request.path).toMatch(/^\/api\/catalog\//)
      expect(request.body).toMatchObject({ tenantId: scope.tenantId })
    }
  })
  it('uses a product and SKU that can be selected as a DEV TEST channel offer', () => {
    expect(buildCatalogSetupRequest('product', scope, {})).toMatchObject({
      body: { productType: 'simple', sku: CATALOG_STARTER.productSku,
        primaryCurrencyCode: 'EGP', isActive: true },
    })
    expect(buildCatalogSetupRequest('variant', scope, ids)).toMatchObject({
      body: { productId: ids.product, isDefault: true, sku: CATALOG_STARTER.variantSku },
    })
    expect(buildCatalogSetupRequest('offer', scope, ids)).toMatchObject({
      body: { productId: ids.product, channelId: ids.channel, isActive: true },
    })
  })
  it('prices the exact variant and offer in EGP without posting funds', () => {
    expect(buildCatalogSetupRequest('priceKind', scope, ids)).toMatchObject({
      body: { tenantId: scope.tenantId, currencyCode: 'EGP', code: CATALOG_STARTER.priceKindCode },
    })
    const price = buildCatalogSetupRequest('price', scope, ids)
    expect(price).toMatchObject({
      body: { productId: ids.product, variantId: ids.variant, offerId: ids.offer,
        channelId: ids.channel, priceKindId: ids.priceKind,
        currencyCode: 'EGP', unitPriceNet: 100, taxRate: 0 },
    })
    expect(CATALOG_SETUP_ROUTES.price).toBe('/api/catalog/prices')
  })
  it('refuses invalid organization or missing dependencies before native create', () => {
    expect(() => buildCatalogSetupRequest('product', { ...scope, organizationId: '' }, ids)).toThrow()
    expect(() => buildCatalogSetupRequest('variant', scope, {})).toThrow('product')
    expect(() => buildCatalogSetupRequest('offer', scope, { product: ids.product })).toThrow('channel')
    expect(() => buildCatalogSetupRequest('price', scope, { ...ids, offer: undefined })).toThrow('offer')
  })
  it('filters foreign tenant, inactive or unrelated product data', () => {
    const good = { id: ids.product, sku: CATALOG_STARTER.productSku,
      tenant_id: scope.tenantId, organization_id: scope.organizationId, is_active: true }
    const bad = { ...good, tenant_id: 'different' }
    const inactive = { ...good, is_active: false }
    const unrelated = { ...good, sku: 'OTHER-SKU' }
    expect(matchingCatalogRows('product', [good, bad, inactive, unrelated], scope, ids))
      .toEqual([good])
  })
  it('matches prices strictly by product, variant, kind, channel, offer and currency', () => {
    const row = {
      product_id: ids.product, variant_id: ids.variant, price_kind_id: ids.priceKind,
      offer_id: ids.offer, channel_id: ids.channel, currency_code: 'EGP', unit_price_net: '100',
    }
    expect(matchingCatalogRows('price', [row], scope, ids)).toHaveLength(1)
    for (const field of ['product_id', 'variant_id', 'price_kind_id',
      'offer_id', 'channel_id', 'currency_code', 'unit_price_net']) {
      expect(matchingCatalogRows('price', [{ ...row, [field]: 'different' }], scope, ids))
        .toHaveLength(0)
    }
  })
})
