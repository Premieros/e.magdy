/**
 * Canonical posting identity for orchestration boundaries.
 * This is a pure key generator, NOT a stock/payment journal or persistence layer.
 * The actual WMS/sales command must enforce uniqueness atomically.
 */
export type PostingIdentity = Readonly<{
  tenantId: string
  organizationId: string
  sourceType: 'purchase-receipt' | 'sales-fulfillment' | 'sales-return'
  sourceDocumentId: string
  sourceLineId: string
  eventId: string
}>

export function canonicalPostingIdentity(input: PostingIdentity): string {
  const fields = [input.tenantId, input.organizationId, input.sourceType,
    input.sourceDocumentId, input.sourceLineId, input.eventId]
  if (fields.some((value) => typeof value !== 'string' || value.trim() !== value ||
      !value || value.length > 200)) {
    throw new Error('Invalid posting identity')
  }
  // Length prefixes avoid delimiter collisions between user-supplied references.
  return fields.map((value) => `${value.length}:${value}`).join('|')
}
