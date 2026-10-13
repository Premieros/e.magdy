import { describe, expect, it } from '@jest/globals'
import { assertRemainingQuantity, toQuantityMicros } from '../quantity-boundaries'

describe('quantity preflight invariants across business verticals', () => {
  it('supports partial receipt without rounding errors', () => {
    expect(() => assertRemainingQuantity({
      authorizedQuantity: '10', alreadyPostedQuantity: '4', proposedQuantity: '6',
    })).not.toThrow()
    expect(toQuantityMicros('0.000001')).toBe(1n)
  })

  it('rejects duplicate shipment, overreceipt and overreturn attempts', () => {
    for (const posted of ['10', '10.000001']) {
      expect(() => assertRemainingQuantity({
        authorizedQuantity: '10', alreadyPostedQuantity: posted, proposedQuantity: '1',
      })).toThrow()
    }
    expect(() => assertRemainingQuantity({
      authorizedQuantity: '2', alreadyPostedQuantity: '1.5', proposedQuantity: '0.500001',
    })).toThrow()
  })

  it.each(['-1', 'NaN', 'Infinity', '1e3', '0.0000001', '01', '', ' 1', '1.', '1,5'])(
    'rejects an invalid decimal %s', (value) => {
      expect(() => toQuantityMicros(value)).toThrow()
    },
  )

  it('does not allow zero posting or non-positive remaining', () => {
    expect(() => assertRemainingQuantity({
      authorizedQuantity: '0', alreadyPostedQuantity: '0', proposedQuantity: '0',
    })).toThrow()
  })
})
