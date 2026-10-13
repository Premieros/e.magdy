/**
 * Redact the one-time administrator password from the dedicated Open Mercato
 * CLI child's stdout/stderr. The upstream v0.9.0 CLI echoes auth:setup argv
 * before the --json handler can silence normal progress output.
 *
 * Install before importing the CLI; the child exits after the command.
 * No secret, fingerprint, or value-derived data is written to a file or log.
 */
const REDACTED = '[REDACTED]'

export function redactSecretOutput(chunk, secret) {
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new Error('A valid private administrator secret is required for log redaction')
  }
  if (typeof chunk === 'string') return chunk.replaceAll(secret, REDACTED)
  if (Buffer.isBuffer(chunk)) {
    if (!chunk.includes(Buffer.from(secret))) return chunk
    return Buffer.from(chunk.toString('utf8').replaceAll(secret, REDACTED), 'utf8')
  }
  return chunk
}

/** Intercepts both console.* output (which uses these streams) and direct writes. */
export function installSecretOutputGuard(secret, streams = [process.stdout, process.stderr]) {
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new Error('Cannot install output guard without an administrator secret')
  }
  for (const stream of streams) {
    const write = stream.write
    stream.write = function (chunk, ...args) {
      return write.call(this, redactSecretOutput(chunk, secret), ...args)
    }
  }
}
