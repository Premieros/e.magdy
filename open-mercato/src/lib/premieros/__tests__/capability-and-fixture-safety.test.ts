import { canonicalOwners, resolveVerticalCapabilities } from '../capability-profiles'
import { assertFixtureEnvironmentSafe, type FixtureEnvironment } from '../fixture-safety'

describe('organization vertical capability definitions', () => {
  it('has no capabilities when the organization has no enabled verticals', () => {
    expect([...resolveVerticalCapabilities([])]).toEqual([])
  })

  it('supports a mixed restaurant and garments organization without duplicated capabilities', () => {
    const capabilities = resolveVerticalCapabilities(['restaurant', 'garments', 'restaurant'])
    expect(capabilities.has('dining')).toBe(true)
    expect(capabilities.has('garment_quality')).toBe(true)
    expect([...capabilities].length).toBe(new Set(capabilities).size)
    expect(capabilities.has('appointments')).toBe(false)
  })

  it('retains official canonical owners', () => {
    expect(canonicalOwners.inventory).toBe('wms')
    expect(canonicalOwners.items).toBe('catalog')
    expect(canonicalOwners.sales).toBe('sales')
  })
})

const isolated: FixtureEnvironment = {
  mode: 'test',
  deploymentEnvironment: 'test',
  vercelEnvironment: 'preview',
  projectId: 'isolated-test-project',
  schema: 'isolated_test',
  approvedProjectId: 'isolated-test-project',
  approvedSchema: 'isolated_test',
  approvalTokenPresent: true,
}

describe('test fixture fail-closed guard', () => {
  it('allows an explicitly approved isolated test target', () => {
    expect(() => assertFixtureEnvironmentSafe(isolated)).not.toThrow()
  })

  it.each([
    [{ mode: 'development' }, 'test mode'],
    [{ deploymentEnvironment: 'production' }, 'production'],
    [{ vercelEnvironment: 'production' }, 'production'],
    [{ approvalTokenPresent: false }, 'approval'],
    [{ schema: 'unexpected_schema' }, 'does not match'],
    [{ approvedProjectId: undefined }, 'approved isolated target'],
    [{
      projectId: 'yumeijsyiphzdsulsubf',
      approvedProjectId: 'yumeijsyiphzdsulsubf',
      schema: 'garments_ops',
      approvedSchema: 'garments_ops',
    }, 'forbidden'],
    [{
      projectId: 'yumeijsyiphzdsulsubf',
      approvedProjectId: 'yumeijsyiphzdsulsubf',
      schema: 'other_schema',
      approvedSchema: 'other_schema',
    }, 'forbidden'],
  ] as const)('rejects unsafe fixture target %#', (patch, message) => {
    expect(() => assertFixtureEnvironmentSafe({ ...isolated, ...patch })).toThrow(message)
  })
})
