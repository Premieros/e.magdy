import { type VerticalCapability } from './capability-profiles'
import { requireVerticalCapability } from './capability-access'
import { parseOrganizationProfile, type OrganizationProfile } from './organization-profile'

/**
 * An adapter boundary for the official Open Mercato organization configuration.
 * The adapter MUST resolve scope and feature permission from authenticated
 * server context; never from client-provided tenant/org/role identifiers.
 * No ORM access, configuration storage or duplicate organization table here.
 */
export type AuthorizedOrganizationContext = Readonly<{
  tenantId: string
  organizationId: string
  subjectId: string
}>

export type TrustedProfileProvider = Readonly<{
  loadOfficialOrganizationProfile: (context: AuthorizedOrganizationContext) => Promise<unknown>
  hasOfficialFeaturePermission: (
    context: AuthorizedOrganizationContext,
    capability: VerticalCapability,
  ) => Promise<boolean>
}>

/** Caller supplies the resolved official server auth scope, not request data. */
export async function requireAuthorizedOrganizationCapability(
  context: AuthorizedOrganizationContext,
  capability: VerticalCapability,
  provider: TrustedProfileProvider,
): Promise<OrganizationProfile> {
  if (!context.tenantId || !context.organizationId || !context.subjectId) {
    throw new Error('Authenticated organization context required')
  }
  // Do not ask ACL for a feature that the organization has not enabled.
  // A malformed/missing configuration must fail closed rather than default on.
  const profile = parseOrganizationProfile(await provider.loadOfficialOrganizationProfile(context))
  const { profileSupports } = await import('./organization-profile')
  if (!profileSupports(profile, capability)) {
    throw new Error('Vertical capability is not enabled or authorized')
  }
  const authorized = await provider.hasOfficialFeaturePermission(context, capability)
  requireVerticalCapability(profile, capability, authorized)
  return profile
}
