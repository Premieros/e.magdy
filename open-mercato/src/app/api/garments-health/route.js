// Diagnostic endpoint: no table data, no secrets, no SQL error text.
import { NextResponse } from 'next/server'
import { checkGarmentsConnection } from '../../../../scripts/garments-db-preflight.mjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function reply(status, state, detail) {
  return NextResponse.json({ app: 'PremierOS Garments', state, detail }, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
export async function GET() {
  try {
    const result=await checkGarmentsConnection()
    if (!result.initialized) return reply(503, 'initialization_required',
      'Connection to permitted project and garments schema verified; ERP tables are not initialized yet.')
    return reply(200, 'database_initialized',
      'Restricted database connection and initial ERP schema verified; login/functional tests still required.')
  } catch (e) {
    const code=String(e?.code||'CHECK_FAILED').replace(/[^A-Z_0-9]/g,'').slice(0,32)
    return reply(503, 'database_check_failed', code)
  }
}
