import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  CatalogProduct, CatalogProductVariant,
} from '@open-mercato/core/modules/catalog/data/entities'
import { buildSageCatalogPreview } from '../../../../lib/premieros/sage-catalog-bridge'
import { resolvePosScope, posErrorResponse } from '../../lib/serverScope'

// An authenticated read-only export, not a Sage service credential, importer,
// authorization bridge, or writable synchronization endpoint.
export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['catalog.products.view'] },
}

const uuid = z.string().uuid()
const querySchema = z.object({
  cursor: uuid.optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  download: z.enum(['1']).optional(),
}).strict()

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) return Response.json(
      { error: 'Invalid catalog preview pagination' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
    const { tenantId, organizationId, container } = await resolvePosScope(request)
    const em = container.resolve<EntityManager>('em')
    const { cursor, pageSize, download } = parsed.data
    const products = await em.find(
      CatalogProduct,
      {
        tenantId, organizationId, deletedAt: null,
        ...(cursor ? { id: { $gt: cursor } } : {}),
      },
      {
        fields: ['id', 'title', 'sku', 'productType', 'isActive'],
        orderBy: { id: 'ASC' },
        limit: pageSize + 1,
      },
    )
    const page = products.slice(0, pageSize)
    const ids = page.map(product => product.id)
    const variants = ids.length ? await em.find(
      CatalogProductVariant,
      { tenantId, organizationId, deletedAt: null, product: { $in: ids } },
      { fields: ['id', 'product', 'sku', 'name', 'barcode', 'isActive'], orderBy: { id: 'ASC' } },
    ) : []
    const projected = buildSageCatalogPreview({
      tenantId, organizationId,
      products: page.map(product => ({
        id: product.id, title: product.title, sku: product.sku,
        productType: product.productType, isActive: product.isActive,
      })),
      variants: variants.map(variant => ({
        id: variant.id, productId: variant.product.id, sku: variant.sku,
        name: variant.name, barcode: variant.barcode, isActive: variant.isActive,
      })),
      nextCursor: products.length > pageSize ? page[page.length - 1]?.id ?? null : null,
    })
    return Response.json(projected, { headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(download ? { 'Content-Disposition': 'attachment; filename="premieros-sage-catalog-preview.json"' } : {}),
    } })
  } catch (error) {
    return posErrorResponse(error)
  }
}

const candidate = z.object({
  openMercatoProductId: uuid,
  openMercatoVariantId: uuid.nullable(),
  suggestedSku: z.string().nullable(),
  title: z.string(),
  variantName: z.string().nullable(),
  barcode: z.string().nullable(),
  openMercatoProductType: z.string(),
  activeInSource: z.boolean(),
  needsExplicitSageTypeMapping: z.literal(true),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'PremierOS POS',
  summary: 'Authenticated read-only Sage interoperability catalog preview',
  methods: {
    GET: {
      summary: 'Inspect canonical product and SKU data without any data migration or writes',
      responses: [{
        status: 200,
        description: 'A bounded, organization-scoped snapshot with explicit unmapped fields',
        schema: z.object({
          schemaVersion: z.literal('premieros.sage.catalog-preview.v1'),
          sourceSystem: z.literal('open-mercato'),
          readOnly: z.literal(true),
          tenantId: uuid, organizationId: uuid,
          rows: z.array(candidate), warnings: z.array(z.string()), nextCursor: uuid.nullable(),
        }),
      }],
    },
  },
}
