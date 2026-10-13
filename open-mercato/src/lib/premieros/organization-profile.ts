import { resolveVerticalCapabilities, verticalCapabilities, type BusinessVertical, type VerticalCapability } from './capability-profiles'

/**
 * A validated organization profile is an inert descriptor, not an ACL grant.
 * Organization identity MUST come from an authenticated Open Mercato server context.
 * Never accept a client-supplied tenant/org ID for profile authorization.
 */
export type OrganizationProfile = Readonly<{
  version: 1
  verticals: readonly BusinessVertical[]
}>

const recognizedVerticals: ReadonlySet<string> = new Set(Object.keys(verticalCapabilities))

function isBusinessVertical(value: unknown): value is BusinessVertical {
  return typeof value === 'string' && recognizedVerticals.has(value)
}

/** Strict parser for an organization-scoped config value. Fail closed. */
export function parseOrganizationProfile(input: unknown): OrganizationProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid organization profile')
  }
  const record = input as Record<string, unknown>
  if (Object.keys(record).some((key) => key !== 'version' && key !== 'verticals')) {
    throw new Error('Unexpected organization profile field')
  }
  if (record.version !== 1 || !Array.isArray(record.verticals)) {
    throw new Error('Unsupported organization profile version')
  }
  if (record.verticals.length > Object.keys(verticalCapabilities).length) {
    throw new Error('Too many organization verticals')
  }
  if (!record.verticals.every(isBusinessVertical)) {
    throw new Error('Unknown organization vertical')
  }
  if (new Set(record.verticals).size !== record.verticals.length) {
    throw new Error('Duplicate organization vertical')
  }
  return Object.freeze({ version: 1, verticals: Object.freeze([...record.verticals]) })
}

/** UI/workflow hint only; perform the real server ACL check independently. */
export function profileSupports(
  profile: OrganizationProfile,
  capability: VerticalCapability,
): boolean {
  return resolveVerticalCapabilities(profile.verticals).has(capability)
}
