/**
 * Explicitly trust only a database CA supplied by the operator from the
 * permitted Supabase project's official SSL settings.
 *
 * This never disables TLS hostname/chain verification, never fetches CA
 * material from an unverified remote, and never prints certificate contents.
 * Node.js 24.5+ supports tls.setDefaultCACertificates (server-side only).
 */
import * as tls from 'node:tls'
import { X509Certificate } from 'node:crypto'

const PEM_CERT = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g

export function parseGarmentsCaCertificates(value) {
  if (value == null || String(value).trim() === '') return []
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 131072) {
    throw new Error('GARMENTS_CA_INVALID_FORMAT')
  }
  // Vercel accepts both multiline PEM and pasted strings containing literal \n.
  const normalized = value.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').trim()
  const matches = normalized.match(PEM_CERT) || []
  if (!matches.length || normalized.replace(PEM_CERT, '').trim()) {
    throw new Error('GARMENTS_CA_INVALID_FORMAT')
  }
  const now = Date.now()
  for (const block of matches) {
    let cert
    try {
      cert = new X509Certificate(block)
    } catch {
      throw new Error('GARMENTS_CA_INVALID_CERTIFICATE')
    }
    if (!cert.ca) throw new Error('GARMENTS_CA_NOT_ROOT_OR_INTERMEDIATE')
    if (!(Date.parse(cert.validFrom) <= now && now <= Date.parse(cert.validTo))) {
      throw new Error('GARMENTS_CA_EXPIRED_OR_NOT_YET_VALID')
    }
  }
  return matches
}

export function databaseCaFromEnv(env = process.env) {
  return parseGarmentsCaCertificates(env.GARMENTS_DB_CA_PEM).join('\n') || undefined
}

/**
 * Append the approved CA to the process's default trust. Existing trusted
 * roots stay trusted; node-postgres still performs normal certificate + host
 * verification with rejectUnauthorized:true.
 */
export function installGarmentsDbCa(env = process.env, tlsApi = tls) {
  const ca = parseGarmentsCaCertificates(env.GARMENTS_DB_CA_PEM)
  if (!ca.length) return false
  if (typeof tlsApi.getCACertificates !== 'function'
    || typeof tlsApi.setDefaultCACertificates !== 'function') {
    throw new Error('GARMENTS_CA_REQUIRES_NODE_24_5_OR_LATER')
  }
  tlsApi.setDefaultCACertificates([...tlsApi.getCACertificates('default'), ...ca])
  return true
}
