import { describe, expect, it } from '@jest/globals'
import { canUseVerticalCapability, requireVerticalCapability } from '../capability-access'
import { parseOrganizationProfile } from '../organization-profile'

describe('vertical capability and permission boundary', () => {
  const restaurant = parseOrganizationProfile({ version: 1, verticals: ['restaurant'] })
  const mixed = parseOrganizationProfile({ version: 1, verticals: ['restaurant', 'garments'] })

  it('never confuses enabled capability with user permission', () => {
    expect(canUseVerticalCapability(restaurant, 'kitchen', false)).toBe(false)
    expect(() => requireVerticalCapability(restaurant, 'kitchen', undefined)).toThrow()
  })

  it('does not authorize another vertical even if user has that feature', () => {
    expect(canUseVerticalCapability(restaurant, 'garment_quality', true)).toBe(false)
    expect(() => requireVerticalCapability(restaurant, 'garment_quality', true)).toThrow()
  })

  it('permits both requirements only when profile AND permission allow', () => {
    expect(canUseVerticalCapability(mixed, 'garment_quality', true)).toBe(true)
    expect(canUseVerticalCapability(mixed, 'kitchen', true)).toBe(true)
    expect(() => requireVerticalCapability(mixed, 'kitchen', true)).not.toThrow()
  })
})
