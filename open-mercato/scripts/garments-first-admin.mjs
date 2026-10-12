/**
 * One-time PremierOS Garments administrator bootstrap.
 *
 * Inputs come from a private execution environment; do not pass passwords
 * on the shell command line, commit them, or store them in application logs.
 *
 * Required: DATABASE_URL, GARMENTS_DB_SCHEMA, SUPABASE_PROJECT_REF,
 *           MIKRO_ORM_SCHEMA, GARMENTS_SETUP_ADMIN_EMAIL,
 *           interactive password entry (or GARMENTS_SETUP_ADMIN_PASSWORD from
 *           a private secret manager), plus deployed SSL/auth settings.
 * Only provisions a fresh, empty garments_ops tenant using the official
 * Open Mercato auth setup command. Never alters AMMCO tables or users.
 */
import { assertRuntimeConfig } from './garments-target-policy.mjs'
import { installGarmentsDbCa } from './garments-db-ca.mjs'
import { emitKeypressEvents } from 'node:readline'
import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Environment values come from a local, ignored copy of Vercel's production
// settings. Do not fetch/decrypt project secrets within the app runtime.
loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local'),
  override: false,
  quiet: true,
})

function fail(message) {
  console.error('Garments first-admin bootstrap refused:', message)
  process.exitCode = 1
}

/**
 * Interactive operator-only secret entry. Raw mode hides typed characters;
 * unlike shell arguments or temporary .env files, no password is written
 * to terminal history or saved on disk. The upstream CLI still applies its
 * own password policy before writing anything.
 */
async function readHiddenPassword(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('No interactive terminal; supply GARMENTS_SETUP_ADMIN_PASSWORD from a private secret manager')
  }
  return new Promise((resolve, reject) => {
    const input = process.stdin
    const wasRaw = input.isRaw === true
    let value = ''
    let complete = false
    process.stdout.write(label)
    emitKeypressEvents(input)
    input.setRawMode(true)
    input.resume()
    const finish = (error) => {
      if (complete) return
      complete = true
      input.removeListener('keypress', onKeypress)
      input.setRawMode(wasRaw)
      if (!wasRaw) input.pause()
      process.stdout.write('\n')
      if (error) reject(error)
      else resolve(value)
    }
    const onKeypress = (character, key) => {
      if (key?.ctrl && key?.name === 'c') return finish(new Error('Operator cancelled password entry'))
      if (key?.name === 'return' || key?.name === 'enter') return finish()
      if (key?.name === 'backspace') {
        value = value.slice(0, -1)
      } else if (!key?.ctrl && !key?.meta && typeof character === 'string'
        && !/[\x00-\x1f\x7f]/.test(character)) {
        value += character
      }
    }
    input.on('keypress', onKeypress)
  })
}

async function main() {
  // Fail closed *before* opening a database connection.
  assertRuntimeConfig(process.env)
  if (process.env.MIKRO_ORM_SCHEMA !== 'garments_ops') {
    throw new Error('MIKRO_ORM_SCHEMA must equal garments_ops')
  }
  const email = (process.env.GARMENTS_SETUP_ADMIN_EMAIL ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Valid GARMENTS_SETUP_ADMIN_EMAIL is required')
  }
  if (email.toLowerCase() !== 'sayed3la2@gmail.com') {
    throw new Error('Admin email does not match the approved PremierOS Garments owner')
  }

  installGarmentsDbCa()
  const { Client } = await import('pg')
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
  })
  try {
    await client.connect()
    // Keep this connection open until setup completes to serialize
    // concurrent executions of this operator-only bootstrap command.
    const lock = await client.query(
      'SELECT pg_try_advisory_lock(875314, 171009) AS acquired',
    )
    if (lock.rows[0]?.acquired !== true) {
      throw new Error('Another PremierOS Garments bootstrap is already running')
    }
    const { rows } = await client.query(`
      SELECT (SELECT count(*)::int FROM garments_ops.tenants) AS tenants,
             (SELECT count(*)::int FROM garments_ops.organizations) AS organizations,
             (SELECT count(*)::int FROM garments_ops.users) AS users,
             (SELECT count(*)::int FROM garments_ops.roles) AS roles
    `)
    const counts = rows[0]
    if (!counts || Object.values(counts).some((n) => n !== 0)) {
      throw new Error('Database is not an empty installation; refuse to create a second initial admin')
    }

  const password = process.env.GARMENTS_SETUP_ADMIN_PASSWORD || await readHiddenPassword('New administrator password (hidden): ')
  if (!process.env.GARMENTS_SETUP_ADMIN_PASSWORD) {
    const repeat = await readHiddenPassword('Confirm password (hidden): ')
    if (repeat !== password) throw new Error('Password confirmation mismatch')
  }
  if (password.length < 16) {
    throw new Error('GARMENTS_SETUP_ADMIN_PASSWORD must be at least 16 characters')
  }

    // Run the version-pinned upstream CLI inside this same Node process.
    // No demo accounts, demo sample data, migrations or skip-policy flags.
    // The password is never part of the parent shell command.
    const originalArgv = process.argv
    try {
      process.argv = [
        process.argv[0],
        process.argv[1],
        'auth', 'setup',
        '--orgName', 'PremierOS Garments',
        '--orgSlug', 'premieros-garments',
        '--email', email,
        '--password', password,
        '--roles', 'superadmin,admin,employee',
      ]
      console.log('Starting official Open Mercato first-tenant setup in garments_ops.')
      await import('./mercato-cli.mjs')
      if (process.exitCode && process.exitCode !== 0) {
        throw new Error('Open Mercato setup reported an unsuccessful exit code')
      }
    } finally {
      process.argv = originalArgv
    }
    const verified = await client.query(`
      SELECT (SELECT count(*)::int FROM garments_ops.tenants) AS tenants,
             (SELECT count(*)::int FROM garments_ops.organizations) AS organizations,
             (SELECT count(*)::int FROM garments_ops.users) AS users,
             (SELECT count(*)::int
                FROM garments_ops.users u
                JOIN garments_ops.user_roles ur ON ur.user_id = u.id
                JOIN garments_ops.roles r ON r.id = ur.role_id
               WHERE lower(u.email) = lower($1) AND r.name = 'superadmin'
              ) AS superadmin_memberships
    `, [email])
    const result = verified.rows[0]
    if (result?.tenants !== 1 || result.organizations !== 1
        || result.users !== 1 || result.superadmin_memberships < 1) {
      throw new Error('Post-setup verification failed; inspect garments_ops before retrying')
    }
    console.log('First administrator and organization created and verified in garments_ops.')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : 'Bootstrap failed')
})
