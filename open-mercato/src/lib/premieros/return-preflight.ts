import { assertRemainingQuantity } from './quantity-boundaries'

/** Return quantity must be bounded by previously fulfilled quantity, not the original order. */
export type ReturnLine = Readonly<{
  fulfilledLineId: string
  fulfilledQuantity: string
  previouslyReturnedQuantity: string
  proposedReturnQuantity: string
}>
export function assertReturnProposal(lines: readonly ReturnLine[]): void {
  if (!lines.length) throw new Error('Return must contain lines')
  const seen = new Set<string>()
  for (const item of lines) {
    if (!item.fulfilledLineId.trim() || seen.has(item.fulfilledLineId)) throw new Error('Duplicate or missing fulfillment line')
    seen.add(item.fulfilledLineId)
    assertRemainingQuantity({
      authorizedQuantity: item.fulfilledQuantity,
      alreadyPostedQuantity: item.previouslyReturnedQuantity,
      proposedQuantity: item.proposedReturnQuantity,
    })
  }
}
