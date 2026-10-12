/**
 * Deliberately inert on all regular deployments.
 *
 * This operator-approved one-off runs only during a Production Vercel build
 * of the exact PremierOS Garments Git branch. It starts the established,
 * schema-locked Open Mercato auth setup in a child process (not a public
 * route), after the runtime has loaded the existing production secrets.
 *
 * The temporary bootstrap password lives in a Vercel Production Secret and
 * MUST be removed from project settings after successful setup; rotate the
 * admin password from the application after the first login. Older deployment
 * snapshots may retain build/runtime env references, hence rotation matters.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const APPROVAL = 'PREMIEROS_GARMENTS_INITIAL_ADMIN_2026_10'
const expectedProject = 'prj_cJZuRsheb50NS5hpy1ePrnA83IBB'
const expectedBranch = 'deploy/garments-mercato'
const expectedEmail = 'sayed3la2@gmail.com'

function validateBootstrapContext(env) {
  if (env.GARMENTS_BOOTSTRAP_BUILD_APPROVAL == null
      || env.GARMENTS_BOOTSTRAP_BUILD_APPROVAL === '') return false
  if (env.GARMENTS_BOOTSTRAP_BUILD_APPROVAL !== APPROVAL) {
    throw new Error('Invalid garments one-time production bootstrap approval')
  }
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production') {
    throw new Error('Bootstrap requires the Vercel production build environment')
  }
  if (env.VERCEL_PROJECT_ID && env.VERCEL_PROJECT_ID !== expectedProject) {
    throw new Error('Wrong Vercel project for garments bootstrap')
  }
  if (env.VERCEL_GIT_COMMIT_REF !== expectedBranch) {
    throw new Error('Garments bootstrap requires the exact approved Git deployment branch')
  }
  if ((env.GARMENTS_SETUP_ADMIN_EMAIL ?? '').trim().toLowerCase() !== expectedEmail) {
    throw new Error('Garments bootstrap admin email is not the approved owner')
  }
  if (typeof env.GARMENTS_SETUP_ADMIN_PASSWORD !== 'string'
      || env.GARMENTS_SETUP_ADMIN_PASSWORD.length < 16) {
    throw new Error('Temporary bootstrap password missing or shorter than 16 characters')
  }
  if (env.MIKRO_ORM_SCHEMA !== 'garments_ops' || env.GARMENTS_DB_SCHEMA !== 'garments_ops'
      || env.SUPABASE_PROJECT_REF !== 'yumeijsyiphzdsulsubf') {
    throw new Error('Refusing to bootstrap outside the approved Supabase schema')
  }
  return true
}

// The build invocation supplies no password to the parent shell or Git logs.
// Do not print or JSON-serialize process.env.
if (validateBootstrapContext(process.env)) {
  const dir = dirname(fileURLToPath(import.meta.url))
  const appDir = resolve(dir, '..')
  const bootstrapFile = resolve(dir, 'garments-first-admin.mjs')
  console.log('Beginning explicitly approved one-time garments first-admin initialization')
  const result = spawnSync(process.execPath, [bootstrapFile], {
    cwd: appDir,
    env: process.env,
    stdio: 'inherit',
    timeout: 180_000,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error('Garments bootstrap CLI failed; deployment is blocked')
  }
  console.log('First-admin bootstrap child process finished; remove the Vercel bootstrap secrets')
}
