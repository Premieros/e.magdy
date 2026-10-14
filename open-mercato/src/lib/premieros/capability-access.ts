import { type OrganizationProfile, profileSupports } from './organization-profile'
import { type VerticalCapability } from './capability-profiles'

/**
 * A pure, conservative gate: capability configuration never grants authorization.
 * The caller must resolve trusted profile and granted features from Open Mercato
 * server-side organization and identity context, not from request payloads.
 */
export function canUseVerticalCapability(
  profile: OrganizationProfile,
  capability: VerticalCapability,
  authorized: boolean,
): boolean {
  return authorized === true && profileSupports(profile, capability)
}

/** Explicitly fail closed when the authorization verdict is missing. */
export function requireVerticalCapability(
  profile: OrganizationProfile,
  capability: VerticalCapability,
  authorized: boolean | undefined,
): void {
  if (!canUseVerticalCapability(profile, capability, authorized === true)) {
    throw new Error('Vertical capability is not enabled or authorized')
  }
}
