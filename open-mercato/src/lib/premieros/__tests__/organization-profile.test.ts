import { describe, it, expect } from '@jest/globals'
import { parseOrganizationProfile, profileSupports } from '../organization-profile'

describe('strict organization capability profile', () => {
  it('accepts distinct, mixed verticals and preserves independent capabilities', () => {
    const profile = parseOrganizationProfile({ version: 1, verticals: ['restaurant', 'garments'] })
    expect(profile.verticals).toEqual(['restaurant', 'garments'])
    expect(profileSupports(profile, 'kitchen')).toBe(true)
    expect(profileSupports(profile, 'garment_production')).toBe(true)
    expect(profileSupports(profile, 'appointments')).toBe(false)
    expect(Object.isFrozen(profile.verticals)).toBe(true)
  })

  it('accepts a baseline org without verticals', () => {
    const profile = parseOrganizationProfile({ version: 1, verticals: [] })
    expect(profileSupports(profile, 'dining')).toBe(false)
  })

  it.each([
    null,
    [],
    {},
    { version: 2, verticals: ['retail'] },
    { version: 1, verticals: 'retail' },
    { version: 1, verticals: ['unknown'] },
    { version: 1, verticals: ['retail', 'retail'] },
    { version: 1, verticals: ['restaurant'], organizationId: 'spoofed' },
    { version: 1, verticals: ['restaurant', 'retail', 'services', 'garments', 'restaurant'] },
  ])('rejects invalid or injected configuration %#', (input) => {
    expect(() => parseOrganizationProfile(input)).toThrow()
  })
})
