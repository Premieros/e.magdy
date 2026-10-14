/**
 * Pure settlement preflight, not a payment ledger or general ledger.
 * Official sales/payment commands must perform final checks atomically.
 * Monetary inputs use integer minor units to avoid floating point drift.
 */
export type SettlementBoundary = Readonly<{
  obligationMinor: bigint
  allocatedMinor: bigint
  proposedMinor: bigint
}>
export function assertSettlementWithinBalance(value: SettlementBoundary): void {
  const { obligationMinor, allocatedMinor, proposedMinor } = value
  if (obligationMinor < 0n || allocatedMinor < 0n || proposedMinor <= 0n) {
    throw new Error('Invalid settlement amount')
  }
  if (allocatedMinor > obligationMinor || proposedMinor > obligationMinor - allocatedMinor) {
    throw new Error('Settlement exceeds outstanding obligation')
  }
}

export function assertBalancedJournal(lines: readonly { debitMinor: bigint; creditMinor: bigint }[]): void {
  if (lines.length < 2) throw new Error('Journal needs at least two lines')
  let debit = 0n
  let credit = 0n
  for (const line of lines) {
    if (line.debitMinor < 0n || line.creditMinor < 0n ||
        (line.debitMinor > 0n && line.creditMinor > 0n)) {
      throw new Error('Invalid journal line')
    }
    debit += line.debitMinor
    credit += line.creditMinor
  }
  if (debit === 0n || debit !== credit) throw new Error('Unbalanced journal')
}
