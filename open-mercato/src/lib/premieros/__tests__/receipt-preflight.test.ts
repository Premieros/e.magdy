import { describe, expect, it } from '@jest/globals'
import { assertPartialReceiptLines } from '../receipt-preflight'

const line = (already: string, proposed: string) => ({
  purchaseLineId: 'po-line-1', orderedQuantity: '10', previouslyReceivedQuantity: already, receivingQuantity: proposed,
})

describe('partial receipt proposal (non-posting)', () => {
  it('accepts 4 of 10, followed by remaining 6', () => {
    expect(() => assertPartialReceiptLines([line('0', '4')])).not.toThrow()
    expect(() => assertPartialReceiptLines([line('4', '6')])).not.toThrow()
  })
  it('rejects an over-receipt and repeat after completion', () => {
    expect(() => assertPartialReceiptLines([line('4', '7')])).toThrow()
    expect(() => assertPartialReceiptLines([line('10', '1')])).toThrow()
  })
  it('rejects missing, duplicate and zero-quantity lines', () => {
    expect(() => assertPartialReceiptLines([])).toThrow()
    expect(() => assertPartialReceiptLines([line('0', '1'), line('0', '1')])).toThrow()
    expect(() => assertPartialReceiptLines([{ ...line('0', '1'), purchaseLineId: ' ' }])).toThrow()
    expect(() => assertPartialReceiptLines([line('0', '0')])).toThrow()
  })
})
