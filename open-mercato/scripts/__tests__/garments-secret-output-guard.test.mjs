import test from 'node:test'
import assert from 'node:assert/strict'
import { redactSecretOutput, installSecretOutputGuard } from '../garments-secret-output-guard.mjs'

// Never use real project credentials in tests or test output.
const fakeSecret = 'FakeOnly!Password2026'

test('redacts password in the upstream auth:setup argv echo without erasing command context', () => {
  const original = '🚀 Running auth:setup --email admin@example.invalid --password ' + fakeSecret + ' --json'
  const result = redactSecretOutput(original, fakeSecret)
  assert.doesNotMatch(result, /FakeOnly!Password2026/)
  assert.match(result, /--password \[REDACTED\]/)
  assert.match(result, /auth:setup/)
})

test('redacts all occurrences in UTF-8 buffers', () => {
  const original = Buffer.from('begin:' + fakeSecret + ':again:' + fakeSecret + ':end')
  const result = redactSecretOutput(original, fakeSecret)
  assert.ok(Buffer.isBuffer(result))
  assert.equal(result.toString('utf8'), 'begin:[REDACTED]:again:[REDACTED]:end')
})

test('intercepts both stdout and stderr, including direct writes', () => {
  const out = []
  const err = []
  const stdout = { write(chunk) { out.push(chunk); return true } }
  const stderr = { write(chunk) { err.push(chunk); return true } }
  installSecretOutputGuard(fakeSecret, [stdout, stderr])
  assert.equal(stdout.write('🚀 Running auth:setup --password ' + fakeSecret), true)
  assert.equal(stderr.write(Buffer.from('Error: ' + fakeSecret)), true)
  assert.ok(!String(out[0]).includes(fakeSecret))
  assert.ok(!String(err[0]).includes(fakeSecret))
  assert.match(String(out[0]), /\[REDACTED\]/)
  assert.match(String(err[0]), /\[REDACTED\]/)
})

test('refuses to install without a sufficiently long secret', () => {
  assert.throws(() => installSecretOutputGuard('weak', []), /secret/)
})
