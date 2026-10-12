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
  const password = process.env.GARMENTS_SETUP_ADMIN_PASSWORD || await readHiddenPassword('New administrator password (hidden): ')
  if (!process.env.GARMENTS_SETUP_ADMIN_PASSWORD) {
    const repeat = await readHiddenPassword('Confirm password (hidden): ')
    if (repeat !== password) throw new Error('Password confirmation mismatch')
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Valid GARMENTS_SETUP_ADMIN_EMAIL is required')
  }
  if (email.toLowerCase() !== 'sayed3la2@gmail.com') {
    throw new Error('Admin email does not match the approved PremierOS Garments owner')
  }
  if (password.length < 16) {
    throw new Error('GARMENTS_SETUP_ADMIN_PASSWORD must be at least 16 characters')
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
  } finally {
    await client.end()
  }

  // Run the version-pinned upstream CLI inside this same Node process. This
  // avoids exposing the password as a *shell* command-line argument.
  // No demo accounts, demo sample data, destructive migrations, or skip-policy flags.
  process.argv = [
    process.argv[0],
    process.argv[1],
    'auth', 'setup',
    '--orgName', 'PremierOS Garments',
    '--orgSlug', 'premieros-garments',
    '--email', email,
    '--password', password,
    '--roles', 'superadmin,admin',
  ]
  console.log('Starting official Open Mercato first-tenant setup in garments_ops.')
  await import('./mercato-cli.mjs')
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : 'Bootstrap failed')
})
