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

/**
 * Prevents ambiguity inside a single proposed batch before it reaches WMS.
 * Only an official transactional command can guarantee durability across requests.
 */
export function assertUniqueScopedPostingBatch(
  context: Readonly<Pick<PostingIdentity, 'tenantId' | 'organizationId'>>,
  entries: readonly PostingIdentity[],
): void {
  if (entries.length === 0) throw new Error('Posting batch must contain events')
  const keys = new Set<string>()
  for (const entry of entries) {
    if (entry.tenantId !== context.tenantId || entry.organizationId !== context.organizationId) {
      throw new Error('Cross-organization posting event')
    }
    const key = canonicalPostingIdentity(entry)
    if (keys.has(key)) throw new Error('Duplicate posting event in batch')
    keys.add(key)
  }
}
