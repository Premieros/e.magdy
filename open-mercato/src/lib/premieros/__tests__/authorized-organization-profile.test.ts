import { describe, expect, it, jest } from '@jest/globals'
import {
  requireAuthorizedOrganizationCapability,
  type AuthorizedOrganizationContext,
  type TrustedProfileProvider,
} from '../authorized-organization-profile'

const context: AuthorizedOrganizationContext = {
  tenantId: 'tenant-a', organizationId: 'org-a', subjectId: 'user-a',
}
const provider = (config: unknown, authorized: boolean): TrustedProfileProvider => ({
  loadOfficialOrganizationProfile: jest.fn(async () => config),
  hasOfficialFeaturePermission: jest.fn(async () => authorized),
})

describe('organization profile trusted-server adapter boundary', () => {
  it('grants capability only with both config and official feature authorization', async () => {
    const source = provider({ version: 1, verticals: ['restaurant'] }, true)
    await expect(requireAuthorizedOrganizationCapability(context, 'kitchen', source)).resolves.toEqual({
      version: 1, verticals: ['restaurant'],
    })
    expect(source.loadOfficialOrganizationProfile).toHaveBeenCalledWith(context)
    expect(source.hasOfficialFeaturePermission).toHaveBeenCalledWith(context, 'kitchen')
  })

  it('rejects when the organization does not enable the activity', async () => {
    const source = provider({ version: 1, verticals: ['garments'] }, true)
    await expect(requireAuthorizedOrganizationCapability(context, 'kitchen', source)).rejects.toThrow()
    expect(source.hasOfficialFeaturePermission).not.toHaveBeenCalled()
  })

  it('rejects when feature permission is denied', async () => {
    await expect(requireAuthorizedOrganizationCapability(context, 'kitchen',
      provider({ version: 1, verticals: ['restaurant'] }, false))).rejects.toThrow()
  })

  it('fails closed if no config or complete authenticated context is available', async () => {
    await expect(requireAuthorizedOrganizationCapability(context, 'kitchen', provider(null, true))).rejects.toThrow()
    const source = provider({ version: 1, verticals: ['restaurant'] }, true)
    await expect(requireAuthorizedOrganizationCapability({ ...context, subjectId: '' }, 'kitchen', source)).rejects.toThrow()
    expect(source.loadOfficialOrganizationProfile).not.toHaveBeenCalled()
  })
})
