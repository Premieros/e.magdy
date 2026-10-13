/**
 * Dedicated subprocess entrypoint for the pinned Open Mercato 0.9.0 CLI.
 *
 * The CLI bin starts main() asynchronously and calls process.exit() once the
 * command finishes. Importing that bin inside the parent bootstrap and then
 * restoring process.argv races with its deferred argument parsing.
 *
 * This entrypoint runs in its OWN process: argv stays in place until the CLI
 * completes and exits. The real password is obtained only from the inherited
 * private environment and inserted into process.argv in memory; it is NEVER
 * passed as an OS command-line argument or written to disk; the output
 * guard masks its value if upstream logs the in-memory argv.
 */
import { assertRuntimeConfig } from './garments-target-policy.mjs'
import { installSecretOutputGuard } from './garments-secret-output-guard.mjs'

assertRuntimeConfig(process.env)
if (process.env.MIKRO_ORM_SCHEMA !== 'garments_ops') {
  throw new Error('MIKRO_ORM_SCHEMA must equal garments_ops')
}

const email = (process.env.GARMENTS_SETUP_ADMIN_EMAIL ?? '').trim().toLowerCase()
if (email !== 'sayed3la2@gmail.com') {
  throw new Error('Garments admin CLI requires the approved email')
}

const password = process.env.GARMENTS_SETUP_ADMIN_PASSWORD
if (typeof password !== 'string' || password.length < 16) {
  throw new Error('Garments admin CLI requires a private password of at least 16 characters')
}

// Open Mercato 0.9.0 echoes auth:setup's entire argument list, including
// --password, *before* the --json handler runs. Protect BOTH output streams
// before importing the CLI. The password remains an in-memory value.
installSecretOutputGuard(password)

// Fail before the CLI is started if the private password does not satisfy
// Open Mercato's own (version-pinned, environment-dependent) policy.
const { getPasswordPolicy, validatePassword } = await import('@open-mercato/shared/lib/auth/passwordPolicy')
if (!validatePassword(password, getPasswordPolicy()).ok) {
  throw new Error('Temporary administrator password does not meet Open Mercato policy; rotate the Production secret before retrying')
}
// The banner is not required for this one-off JSON bootstrap. This flag
// does NOT silence argument echoes, which the output guard already redacts.
process.env.OM_CLI_QUIET = '1'

// The real OS argv is just: node scripts/garments-auth-setup-child.mjs.
// The official CLI reads process.argv only after its asynchronous bootstrap,
// so this in-memory argv must never be restored during the child's lifetime.
process.argv = [
  process.execPath,
  process.argv[1],
  'auth', 'setup',
  '--orgName', 'PremierOS Garments',
  '--orgSlug', 'premieros-garments',
  '--email', email,
  '--password', password,
  '--roles', 'superadmin,admin,employee',
  '--json',
]

// Open Mercato's bin.ts owns its lifecycle and calls process.exit(exitCode).
// --json limits setup logs. The separate output guard also masks the upstream
// argument echo before the CLI handler executes.
// No demo-user or password-policy bypass flags are passed.
await import('./mercato-cli.mjs')
