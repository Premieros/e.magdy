/**
 * Pure capability definitions for optional organization verticals.
 * This file does not persist settings, grant permissions or alter Open Mercato.
 * The caller MUST load organization-scoped settings from an authorized server context.
 */
export const verticalCapabilities = {
  restaurant: ['dining', 'kitchen', 'recipes', 'delivery'],
  garments: ['size_color_matrix', 'garment_production', 'garment_quality'],
  retail: ['retail_pos'],
  services: ['appointments', 'service_fulfillment'],
} as const

export type BusinessVertical = keyof typeof verticalCapabilities
export type VerticalCapability = (typeof verticalCapabilities)[BusinessVertical][number]

/**
 * Resolve UI/workflow availability only. Never use this result instead of
 * Open Mercato's server-side ACL, tenant or organization authorization.
 */
export function resolveVerticalCapabilities(
  enabled: readonly BusinessVertical[],
): ReadonlySet<VerticalCapability> {
  const capabilities = new Set<VerticalCapability>()
  for (const vertical of enabled) {
    for (const capability of verticalCapabilities[vertical]) {
      capabilities.add(capability)
    }
  }
  return capabilities
}

/** All parties, items, balances, sales and money keep their official module owners. */
export const canonicalOwners = Object.freeze({
  identity: 'auth',
  organization: 'directory',
  parties: 'customers',
  items: 'catalog',
  inventory: 'wms',
  sales: 'sales',
} as const)
