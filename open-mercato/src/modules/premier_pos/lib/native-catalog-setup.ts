import { requireNativeSetupScope, setupRowField, type NativeSetupRow, type NativeSetupScope } from './native-setup'

export const CATALOG_STARTER = {
  productSku: 'DEV-TEST-SAMPLE-001',
  variantSku: 'DEV-TEST-SAMPLE-001-ONE',
  priceKindCode: 'dev_test_standard',
  currencyCode: 'EGP',
  priceNet: 100,
} as const

export type NativeCatalogStage = 'product' | 'variant' | 'priceKind' | 'offer' | 'price'
export const CATALOG_SETUP_STAGES: readonly NativeCatalogStage[] = [
  'product', 'variant', 'priceKind', 'offer', 'price',
]
export const CATALOG_SETUP_ROUTES: Record<NativeCatalogStage, string> = {
  product: '/api/catalog/products',
  variant: '/api/catalog/variants',
  priceKind: '/api/catalog/price-kinds',
  offer: '/api/catalog/offers',
  price: '/api/catalog/prices',
}
export const CATALOG_STAGE_DEPENDENCIES: Record<NativeCatalogStage, readonly NativeCatalogStage[]> = {
  product: [],
  variant: ['product'],
  priceKind: [],
  offer: ['product'],
  price: ['variant', 'priceKind', 'offer'],
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function validCatalogId(id: unknown): id is string {
  return typeof id === 'string' && UUID.test(id)
}

export function matchingCatalogRows(
  stage: NativeCatalogStage,
  rows: readonly NativeSetupRow[],
  scope: NativeSetupScope,
  ids: Readonly<Partial<Record<'product' | 'variant' | 'priceKind' | 'channel' | 'offer', string>>>,
): NativeSetupRow[] {
  requireNativeSetupScope(scope)
  const wanted = (stage === 'product') ? CATALOG_STARTER.productSku :
    (stage === 'variant') ? CATALOG_STARTER.variantSku :
    (stage === 'priceKind') ? CATALOG_STARTER.priceKindCode : null
  return rows.filter(row => {
    const org = setupRowField(row, 'organizationId')
    const tenant = setupRowField(row, 'tenantId')
    const deleted = setupRowField(row, 'deletedAt')
    const active = setupRowField(row, 'isActive')
    if ((org != null && org !== scope.organizationId) ||
        (tenant != null && tenant !== scope.tenantId) ||
        deleted != null || active === false) return false
    if (wanted !== null) {
      if (String(setupRowField(row, stage === 'priceKind' ? 'code' : 'sku') ?? '') !== wanted) return false
      if (stage === 'variant' && setupRowField(row, 'productId') !== ids.product) return false
      return true
    }
    if (stage === 'offer') return setupRowField(row, 'productId') === ids.product &&
        setupRowField(row, 'channelId') === ids.channel
    return setupRowField(row, 'productId') === ids.product &&
      setupRowField(row, 'variantId') === ids.variant &&
      setupRowField(row, 'offerId') === ids.offer &&
      setupRowField(row, 'priceKindId') === ids.priceKind &&
      setupRowField(row, 'currencyCode') === CATALOG_STARTER.currencyCode
  })
}

/** Only runs in response to an explicit user click; actual permissions stay in Open Mercato. */
export function buildCatalogSetupRequest(
  stage: NativeCatalogStage,
  scope: NativeSetupScope,
  ids: Readonly<Partial<Record<'product' | 'variant' | 'priceKind' | 'channel' | 'offer', string>>>,
) {
  requireNativeSetupScope(scope)
  const requires: Record<NativeCatalogStage, readonly (keyof typeof ids)[]> = {
    product: [], variant: ['product'], priceKind: [], offer: ['product', 'channel'],
    price: ['product', 'variant', 'priceKind', 'offer', 'channel'],
  }
  for (const required of requires[stage]) {
    if (!validCatalogId(ids[required])) throw new Error(`Missing verified ${required} for catalog ${stage}`)
  }
  const base = { tenantId: scope.tenantId, organizationId: scope.organizationId }
  let body: Record<string, unknown>
  switch (stage) {
    case 'product':
      body = { ...base, title: 'DEV TEST - Sample Product', sku: CATALOG_STARTER.productSku,
        productType: 'simple', primaryCurrencyCode: CATALOG_STARTER.currencyCode,
        isActive: true }
      break
    case 'variant':
      body = { ...base, productId: ids.product, sku: CATALOG_STARTER.variantSku,
        name: 'Default sample variant', isDefault: true, isActive: true }
      break
    case 'priceKind':
      // Official Open Mercato price kinds are tenant-scoped, not organization-scoped.
      body = { tenantId: scope.tenantId, code: CATALOG_STARTER.priceKindCode,
        title: 'DEV TEST - Standard price', currencyCode: CATALOG_STARTER.currencyCode,
        displayMode: 'excluding-tax', isActive: true }
      break
    case 'offer':
      body = { ...base, productId: ids.product, channelId: ids.channel,
        title: 'DEV TEST - Sample channel offer', isActive: true }
      break
    case 'price':
      body = { ...base, productId: ids.product, variantId: ids.variant,
        offerId: ids.offer, channelId: ids.channel,
        priceKindId: ids.priceKind, currencyCode: CATALOG_STARTER.currencyCode,
        unitPriceNet: CATALOG_STARTER.priceNet, taxRate: 0 }
      break
  }
  return { path: CATALOG_SETUP_ROUTES[stage], body }
}
