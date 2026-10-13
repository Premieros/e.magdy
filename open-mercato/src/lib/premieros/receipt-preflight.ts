import { assertRemainingQuantity } from './quantity-boundaries'

/**
 * Non-posting validation for a proposed partial purchase receipt.
 * Quantities MUST be retrieved from the official purchase and WMS contracts
 * under the same authenticated tenant/organization scope.
 * This function does not reserve, move or update stock.
 */
export type ReceiptLine = Readonly<{
  purchaseLineId: string
  orderedQuantity: string
  previouslyReceivedQuantity: string
  receivingQuantity: string
}>
export function assertPartialReceiptLines(lines: readonly ReceiptLine[]): void {
  if (lines.length === 0) throw new Error('At least one purchase line is required')
  const seen = new Set<string>()
  for (const line of lines) {
    if (!line.purchaseLineId.trim() || seen.has(line.purchaseLineId)) {
      throw new Error('Duplicate or missing purchase line')
    }
    seen.add(line.purchaseLineId)
    assertRemainingQuantity({
      authorizedQuantity: line.orderedQuantity,
      alreadyPostedQuantity: line.previouslyReceivedQuantity,
      proposedQuantity: line.receivingQuantity,
    })
  }
}
