import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { SalesPaymentMethod } from '@open-mercato/core/modules/sales/data/entities'
import { resolvePosScope, posErrorResponse } from '../../lib/serverScope'

// Payment operators may read method labels without receiving settings-management access.
export const metadata = { GET: { requireAuth: true, requireFeatures: ['sales.payments.manage'] } }
export async function GET(request: Request) {
  try {
    const scope = await resolvePosScope(request)
    const em = scope.container.resolve<EntityManager>('em')
    const methods = await em.find(SalesPaymentMethod, { tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null, isActive: true, providerKey: null }, { fields: ['id', 'name', 'code'], orderBy: { name: 'ASC' }, limit: 100 })
    return Response.json({ items: methods.map(({ id, name, code }) => ({ id, name, code })), tenantId: scope.tenantId, organizationId: scope.organizationId }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return posErrorResponse(error) }
}
export const openApi: OpenApiRouteDoc = { tag: 'PremierOS POS', summary: 'Configured payment method labels', methods: { GET: { summary: 'Read active payment methods in the selected organization', responses: [{ status: 200, description: 'Scoped labels only', schema: z.object({ items: z.array(z.object({ id: z.string().uuid(), name: z.string(), code: z.string() })), tenantId: z.string().uuid(), organizationId: z.string().uuid() }) }] } } }
