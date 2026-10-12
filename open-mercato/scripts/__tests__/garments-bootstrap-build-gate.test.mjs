import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const script = resolve(dirname(fileURLToPath(import.meta.url)), '../garments-bootstrap-build-gate.mjs')
const approval = 'PREMIEROS_GARMENTS_INITIAL_ADMIN_2026_10'

function run(env) {
  const p = spawnSync(process.execPath, [script], {
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8',
    timeout: 5_000,
  })
  return { status: p.status, text: String(p.stdout ?? '') + String(p.stderr ?? '') }
}

test('no approval: no-op without touching administrator setup', () => {
  const result = run({})
  assert.equal(result.status, 0)
  assert.doesNotMatch(result.text, /Beginning explicitly approved|First-admin/)
})

test('incorrect approval is rejected before any database call', () => {
  const result = run({ GARMENTS_BOOTSTRAP_BUILD_APPROVAL: 'wrong' })
  assert.notEqual(result.status, 0)
  assert.match(result.text, /Invalid garments one-time/)
})

test('test and preview deployments cannot run the one-time gate', () => {
  for (const env of [{ VERCEL: '1', VERCEL_ENV: 'preview' }, { VERCEL: '0', VERCEL_ENV: 'production' }]) {
    const result = run({ GARMENTS_BOOTSTRAP_BUILD_APPROVAL: approval, ...env })
    assert.notEqual(result.status, 0)
    assert.match(result.text, /requires the Vercel production build/)
  }
})

test('approved build refuses the wrong Git branch', () => {
  const result = run({
    GARMENTS_BOOTSTRAP_BUILD_APPROVAL: approval,
    VERCEL: '1',
    VERCEL_ENV: 'production',
    VERCEL_GIT_COMMIT_REF: 'other',
  })
  assert.notEqual(result.status, 0)
  assert.match(result.text, /exact approved Git deployment branch/)
})

test('approved build rejects missing password before any DB access', () => {
  const result = run({
    GARMENTS_BOOTSTRAP_BUILD_APPROVAL: approval,
    VERCEL: '1',
    VERCEL_ENV: 'production',
    VERCEL_GIT_COMMIT_REF: 'deploy/garments-mercato',
    GARMENTS_SETUP_ADMIN_EMAIL: 'sayed3la2@gmail.com',
  })
  assert.notEqual(result.status, 0)
  assert.match(result.text, /Temporary bootstrap password not available/)
})

test('short password is rejected distinctly without printing its value', () => {
  const result = run({
    GARMENTS_BOOTSTRAP_BUILD_APPROVAL: approval,
    VERCEL: '1',
    VERCEL_ENV: 'production',
    VERCEL_GIT_COMMIT_REF: 'deploy/garments-mercato',
    GARMENTS_SETUP_ADMIN_EMAIL: 'sayed3la2@gmail.com',
    GARMENTS_SETUP_ADMIN_PASSWORD: 'too-short',
  })
  assert.notEqual(result.status, 0)
  assert.match(result.text, /fails the minimum 16-character requirement/)
  assert.doesNotMatch(result.text, /too-short/)
})
