import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { Currency } from '@open-mercato/core/modules/currencies/data/entities'
import { resolvePosScope, posErrorResponse } from '../../lib/serverScope'

/**
 * Cashiers only need names/codes of usable currencies for the selected
 * organization. Do not require currencies.manage or rely on the optional
 * customers currency dictionary; Currency remains the single official source.
 */
export const metadata = { GET: { requireAuth: true, requireFeatures: ['sales.orders.manage'] } }

export async function GET(request: Request) {
  try {
    const scope = await resolvePosScope(request)
    const em = scope.container.resolve<EntityManager>('em')
    const currencies = await em.find(
      Currency,
      {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        isActive: true,
        deletedAt: null,
      },
      { fields: ['code', 'name'], orderBy: { code: 'ASC' }, limit: 100 },
    )
    return Response.json({
      items: currencies.map(({ code, name }) => ({ value: code, label: `${code} - ${name}` })),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return posErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'PremierOS POS',
  summary: 'Active official currency labels in selected organization',
  methods: {
    GET: {
      summary: 'Read scoped active currency options for sales operators',
      responses: [{
        status: 200,
        description: 'Active currency options from the currencies module',
        schema: z.object({ items: z.array(z.object({ value: z.string(), label: z.string() })) }),
      }],
    },
  },
}
