/**
 * Pure preflight quantity checks for workflow adapters, NOT a stock balance,
 * PO ledger, fulfillment source or authorization substitute. The official
 * Open Mercato command must atomically repeat the checks against current data.
 * Decimal strings avoid floating point rounding in unit reconciliation.
 */
const scale = 1_000_000n
export function toQuantityMicros(value: string): bigint {
  if (!/^(0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)) throw new Error('Invalid nonnegative decimal quantity')
  const [whole, fractional = ''] = value.split('.')
  return BigInt(whole) * scale + BigInt(fractional.padEnd(6, '0'))
}

export type QuantityBoundary = Readonly<{
  authorizedQuantity: string
  alreadyPostedQuantity: string
  proposedQuantity: string
}>

/**
 * Validates a bounded receipt, dispatch, return or stage completion.
 * Caller must supply values read from the canonical source under an atomic lock.
 */
export function assertRemainingQuantity(boundary: QuantityBoundary): void {
  const authorized = toQuantityMicros(boundary.authorizedQuantity)
  const posted = toQuantityMicros(boundary.alreadyPostedQuantity)
  const proposed = toQuantityMicros(boundary.proposedQuantity)
  if (proposed <= 0n) throw new Error('Posting quantity must be greater than zero')
  if (posted > authorized || proposed > authorized - posted) {
    throw new Error('Posting exceeds authorized remaining quantity')
  }
}
