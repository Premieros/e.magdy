import { z } from 'zod'
import { orderLineCreateSchema } from '@open-mercato/core/modules/sales/data/validators'

export const posLineSchema = orderLineCreateSchema.omit({ tenantId: true, organizationId: true, orderId: true }).safeExtend({
  quantity: z.coerce.number().finite().positive().max(1_000_000),
}).refine((line) => line.unitPriceGross !== undefined || line.unitPriceNet !== undefined, { message: 'A price is required' })
export const previewSchema = z.object({
  currencyCode: z.string().regex(/^[A-Z]{3}$/), channelId: z.string().uuid(),
  expectedOrganizationId: z.string().uuid(), expectedTenantId: z.string().uuid(),
  lines: z.array(posLineSchema).min(1).max(100),
}).strict()
