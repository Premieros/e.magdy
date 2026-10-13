/**
 * Safety barrier for future E2E fixture entrypoints.
 * No data writes are implemented here. A test runner must ALSO validate
 * database identity via its authenticated server connection before seeding.
 */
export type FixtureEnvironment = Readonly<{
  mode: string | undefined
  deploymentEnvironment: string | undefined
  vercelEnvironment: string | undefined
  projectId: string | undefined
  schema: string | undefined
  approvedProjectId: string | undefined
  approvedSchema: string | undefined
  approvalTokenPresent: boolean
}>

export function assertFixtureEnvironmentSafe(env: FixtureEnvironment): void {
  if (env.mode !== 'test') throw new Error('Fixture seeding requires test mode')
  if (env.deploymentEnvironment === 'production' || env.vercelEnvironment === 'production') {
    throw new Error('Fixture seeding is disabled in production deployments')
  }
  if (!env.approvedProjectId || !env.approvedSchema || !env.projectId || !env.schema) {
    throw new Error('Fixture seeding requires an explicitly approved isolated target')
  }
  if (env.projectId !== env.approvedProjectId || env.schema !== env.approvedSchema) {
    throw new Error('Fixture target does not match the approved isolated target')
  }
  if (env.projectId === 'yumeijsyiphzdsulsubf' && env.schema === 'garments_ops') {
    throw new Error('Fixture seeding is forbidden against the production ERP schema')
  }
  if (!env.approvalTokenPresent) throw new Error('Fixture seeding requires explicit approval')
}
