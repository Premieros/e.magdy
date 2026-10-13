/**
 * Initial tenant setup is permanently disabled for this existing installation.
 * Recovery uses the separately approved existing-organization scripts only.
 * Regular application builds never initialize tenants or users.
 */
if (process.env.GARMENTS_BOOTSTRAP_BUILD_APPROVAL) {
  throw new Error('Initial auth setup is disabled; remove GARMENTS_BOOTSTRAP_BUILD_APPROVAL and use existing-organization recovery')
}
