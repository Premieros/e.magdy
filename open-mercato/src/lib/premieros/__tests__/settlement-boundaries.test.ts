import { describe, expect, it } from '@jest/globals'
import { assertBalancedJournal, assertSettlementWithinBalance } from '../settlement-boundaries'

describe('settlement boundaries', () => {
  it('allows the exact remaining payment after a partial collection', () => {
    expect(() => assertSettlementWithinBalance({
      obligationMinor: 10000n, allocatedMinor: 3500n, proposedMinor: 6500n,
    })).not.toThrow()
  })
  it('rejects replay, over-allocation and invalid amounts', () => {
    for (const value of [
      { obligationMinor: 10000n, allocatedMinor: 10000n, proposedMinor: 1n },
      { obligationMinor: 10000n, allocatedMinor: 9000n, proposedMinor: 1001n },
      { obligationMinor: 10000n, allocatedMinor: 10001n, proposedMinor: 1n },
      { obligationMinor: 10000n, allocatedMinor: 0n, proposedMinor: 0n },
    ]) expect(() => assertSettlementWithinBalance(value)).toThrow()
  })
  it('checks debit-credit reconciliation without writing an alternate journal', () => {
    expect(() => assertBalancedJournal([
      { debitMinor: 12000n, creditMinor: 0n },
      { debitMinor: 0n, creditMinor: 12000n },
    ])).not.toThrow()
    expect(() => assertBalancedJournal([
      { debitMinor: 12000n, creditMinor: 0n },
      { debitMinor: 0n, creditMinor: 11999n },
    ])).toThrow('Unbalanced journal')
  })
})
