import { describe, expect, it } from '@jest/globals'
import { assertFulfillmentProposal } from '../fulfillment-preflight'
import { assertReturnProposal } from '../return-preflight'

describe('official WMS workflow preflight proposals (non-posting)', () => {
  it('allows partial dispatches of 3 followed by 7 from order 10', () => {
    expect(() => assertFulfillmentProposal([{ sourceLineId: 's1', authorizedQuantity: '10', alreadyFulfilledQuantity: '0', proposedQuantity: '3' }])).not.toThrow()
    expect(() => assertFulfillmentProposal([{ sourceLineId: 's1', authorizedQuantity: '10', alreadyFulfilledQuantity: '3', proposedQuantity: '7' }])).not.toThrow()
  })
  it('rejects overshipment and duplicate sales line', () => {
    const line = { sourceLineId: 's1', authorizedQuantity: '10', alreadyFulfilledQuantity: '9', proposedQuantity: '2' }
    expect(() => assertFulfillmentProposal([line])).toThrow()
    expect(() => assertFulfillmentProposal([line, line])).toThrow()
  })
  it('does not allow returning more than was actually fulfilled', () => {
    expect(() => assertReturnProposal([{ fulfilledLineId: 'f1', fulfilledQuantity: '3', previouslyReturnedQuantity: '1', proposedReturnQuantity: '2' }])).not.toThrow()
    expect(() => assertReturnProposal([{ fulfilledLineId: 'f1', fulfilledQuantity: '3', previouslyReturnedQuantity: '1', proposedReturnQuantity: '3' }])).toThrow()
  })
  it('rejects empty, missing or duplicate return lines', () => {
    const line = { fulfilledLineId: 'f1', fulfilledQuantity: '3', previouslyReturnedQuantity: '0', proposedReturnQuantity: '1' }
    expect(() => assertReturnProposal([])).toThrow()
    expect(() => assertReturnProposal([line, line])).toThrow()
    expect(() => assertReturnProposal([{ ...line, fulfilledLineId: '' }])).toThrow()
  })
})
