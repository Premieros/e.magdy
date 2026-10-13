import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { resolveSingleOrganizationIdOrDeny } from '@open-mercato/core/modules/directory/utils/organizationScopeFilter'

export async function resolvePosScope(request: Request) {
  const auth = await getAuthFromRequest(request)
  if (!auth?.sub || !auth.tenantId) throw new CrudHttpError(401, { error: 'Authentication required' })
  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const organizationId = resolveSingleOrganizationIdOrDeny(scope, auth)
  const tenantId = scope.tenantId
  if (!organizationId || !tenantId) throw new CrudHttpError(400, { error: 'Select an organization' })
  return { auth, container, tenantId, organizationId }
}

export function posErrorResponse(error: unknown) {
  if (isCrudHttpError(error)) return Response.json(error.body, { status: error.status })
  return Response.json({ error: 'Point of sale temporarily unavailable' }, { status: 500 })
}
