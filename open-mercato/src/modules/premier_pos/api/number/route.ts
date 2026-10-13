import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { SalesDocumentNumberGenerator } from '@open-mercato/core/modules/sales/services/salesDocumentNumberGenerator'
import { resolvePosScope, posErrorResponse } from '../../lib/serverScope'

const input = z.object({ kind: z.enum(['order', 'invoice']), expectedOrganizationId: z.string().uuid(), expectedTenantId: z.string().uuid() }).strict()
// Automatic assignment is the same capability already used by native document creation.
// No caller-supplied number or format is accepted, and number-editing access is not granted.
export const metadata = { POST: { requireAuth: true, requireFeatures: ['sales.orders.manage', 'sales.invoices.manage'] } }
export async function POST(request: Request) {
  try {
    const scope = await resolvePosScope(request)
    const parsed = input.safeParse(await request.json())
    if (!parsed.success) return Response.json({ error: 'Invalid numbering request' }, { status: 400 })
    if (parsed.data.expectedTenantId !== scope.tenantId || parsed.data.expectedOrganizationId !== scope.organizationId) return Response.json({ error: 'Organization changed', code: 'POS_SCOPE_CHANGED' }, { status: 409 })
    const generator = scope.container.resolve<SalesDocumentNumberGenerator>('salesDocumentNumberGenerator')
    const result = await generator.generate({ kind: parsed.data.kind, tenantId: scope.tenantId, organizationId: scope.organizationId })
    return Response.json({ number: result.number }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return posErrorResponse(error) }
}
export const openApi: OpenApiRouteDoc = { tag: 'PremierOS POS', summary: 'Automatically assign a native document number', methods: { POST: { summary: 'Use configured numbering in the verified current scope', requestBody: { contentType: 'application/json', schema: input }, responses: [{ status: 200, description: 'Native generated number', schema: z.object({ number: z.string() }) }] } } }
