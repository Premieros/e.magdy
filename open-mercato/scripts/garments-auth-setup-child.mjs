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
 * passed as an OS command-line argument, written to disk, or logged.
 */
import { assertRuntimeConfig } from './garments-target-policy.mjs'

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
// --json prevents normal setup logs and generated passwords from reaching logs.
// No demo-user or password-policy bypass flags are passed.
await import('./mercato-cli.mjs')
