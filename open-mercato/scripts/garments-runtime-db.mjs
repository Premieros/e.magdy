/** Serverless runtime connection mode; preserves the sole DB target and login. */
import { assertRuntimeConfig } from './garments-target-policy.mjs'
export function configureGarmentsRuntimeDb(env = process.env) {
  if (env.GARMENTS_RUNTIME_DB_POOL_MODE == null) return false
  if (env.GARMENTS_RUNTIME_DB_POOL_MODE !== 'transaction') throw new Error('Unsupported garments runtime pool mode')
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production' ||
    env.VERCEL_PROJECT_ID !== 'prj_cJZuRsheb50NS5hpy1ePrnA83IBB') {
    throw new Error('Runtime pool mode requires the approved Vercel Production project')
  }
  const target = assertRuntimeConfig(env)
  if (target.connectionType !== 'pooler' || env.MIKRO_ORM_SCHEMA !== 'garments_ops') {
    throw new Error('Restricted project-scoped pooler and ORM schema required')
  }
  const url = new URL(env.DATABASE_URL)
  url.port = '6543'
  const candidate = { ...env, DATABASE_URL: url.href }
  assertRuntimeConfig(candidate)
  env.DATABASE_URL = candidate.DATABASE_URL
  return true
}
