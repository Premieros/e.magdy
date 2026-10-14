import { describe, expect, it } from '@jest/globals'
import { canonicalPostingIdentity, assertUniqueScopedPostingBatch, type PostingIdentity } from '../posting-identity'

const entry: PostingIdentity = {
  tenantId: 't1', organizationId: 'o1', sourceType: 'purchase-receipt',
  sourceDocumentId: 'po1', sourceLineId: 'line1', eventId: 'receipt-1',
}
describe('canonical WMS posting identity (non-posting)', () => {
  it('is stable for a retry of the same source event', () => {
    expect(canonicalPostingIdentity(entry)).toBe(canonicalPostingIdentity({ ...entry }))
  })
  it('separates tenant, organization, lines and distinct partial receipt events', () => {
    const original = canonicalPostingIdentity(entry)
    for (const delta of [
      { tenantId: 't2' }, { organizationId: 'o2' },
      { sourceLineId: 'line2' }, { eventId: 'receipt-2' },
      { sourceType: 'sales-return' as const },
    ]) expect(canonicalPostingIdentity({ ...entry, ...delta })).not.toBe(original)
  })
  it('cannot collide when identifiers contain separators', () => {
    expect(canonicalPostingIdentity({ ...entry, sourceDocumentId: 'a|b', sourceLineId: 'c' }))
      .not.toBe(canonicalPostingIdentity({ ...entry, sourceDocumentId: 'a', sourceLineId: 'b|c' }))
  })
  it('fails closed on missing or padded context', () => {
    expect(() => canonicalPostingIdentity({ ...entry, tenantId: '' })).toThrow()
    expect(() => canonicalPostingIdentity({ ...entry, organizationId: ' o1' })).toThrow()
  })
})

describe('proposed WMS batch safety', () => {
  it('allows separate partial-receipt events in the same scope', () => {
    expect(() => assertUniqueScopedPostingBatch(
      { tenantId: 't1', organizationId: 'o1' },
      [entry, { ...entry, eventId: 'receipt-2' }],
    )).not.toThrow()
  })
  it('denies replayed IDs and mixed organization or tenant', () => {
    const scope = { tenantId: 't1', organizationId: 'o1' }
    expect(() => assertUniqueScopedPostingBatch(scope, [entry, entry])).toThrow('Duplicate')
    expect(() => assertUniqueScopedPostingBatch(scope, [entry, { ...entry, organizationId: 'o2' }])).toThrow('Cross-organization')
    expect(() => assertUniqueScopedPostingBatch(scope, [{ ...entry, tenantId: 't2' }])).toThrow('Cross-organization')
    expect(() => assertUniqueScopedPostingBatch(scope, [])).toThrow()
  })
})
