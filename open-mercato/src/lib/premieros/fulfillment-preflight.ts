import { assertRemainingQuantity } from './quantity-boundaries'

/** Proposal-only guard; canonical sales/WMS services must revalidate atomically. */
export type FulfillmentLine = Readonly<{
  sourceLineId: string
  authorizedQuantity: string
  alreadyFulfilledQuantity: string
  proposedQuantity: string
}>
export function assertFulfillmentProposal(lines: readonly FulfillmentLine[]): void {
  if (!lines.length) throw new Error('Fulfillment must contain lines')
  const seen = new Set<string>()
  for (const item of lines) {
    if (!item.sourceLineId.trim() || seen.has(item.sourceLineId)) throw new Error('Duplicate or missing source line')
    seen.add(item.sourceLineId)
    assertRemainingQuantity({
      authorizedQuantity: item.authorizedQuantity,
      alreadyPostedQuantity: item.alreadyFulfilledQuantity,
      proposedQuantity: item.proposedQuantity,
    })
  }
}
