import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { SalesChannel } from '@open-mercato/core/modules/sales/data/entities'
import type { SalesCalculationService } from '@open-mercato/core/modules/sales/services/salesCalculationService'
import { resolvePosScope, posErrorResponse } from '../../lib/serverScope'
import { previewSchema } from '../../lib/schema'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['sales.orders.manage', 'catalog.products.view'] } }

export async function POST(request: Request) {
  try {
    const scope = await resolvePosScope(request)
    const parsed = previewSchema.safeParse(await request.json())
    if (!parsed.success) return Response.json({ error: 'Invalid cart' }, { status: 400 })
    const data = parsed.data
    if (data.expectedOrganizationId !== scope.organizationId || data.expectedTenantId !== scope.tenantId) {
      return Response.json({ error: 'Organization changed', code: 'POS_SCOPE_CHANGED' }, { status: 409 })
    }
    const em = scope.container.resolve<EntityManager>('em')
    const channel = await em.findOne(SalesChannel, { id: data.channelId, organizationId: scope.organizationId, tenantId: scope.tenantId, deletedAt: null, isActive: true }, { fields: ['id'] })
    if (!channel) return Response.json({ error: 'Sales channel unavailable' }, { status: 403 })
    const service = scope.container.resolve<SalesCalculationService>('salesCalculationService')
    const result = await service.calculateDocumentTotals({
      documentKind: 'order',
      context: { tenantId: scope.tenantId, organizationId: scope.organizationId, currencyCode: data.currencyCode, resolve: (name) => scope.container.resolve(name) },
      lines: data.lines.map(({ totalNetAmount: _net, totalGrossAmount: _gross, taxAmount: _tax, ...line }) => ({ ...line, kind: line.kind ?? 'product', currencyCode: data.currencyCode })),
    })
    return Response.json({ totals: result.totals, lines: result.lines }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid cart' }, { status: 400 })
    return posErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'PremierOS POS', summary: 'Preview scoped cart totals',
  methods: { POST: { summary: 'Calculate a draft with the native sales engine', requestBody: { contentType: 'application/json', schema: previewSchema }, responses: [{ status: 200, description: 'Non-persisted totals', schema: z.object({ totals: z.record(z.string(), z.unknown()), lines: z.array(z.unknown()) }) }] } },
}
