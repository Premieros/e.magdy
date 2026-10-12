/**
 * One-off, controlled diagnostics for Open Mercato migration failures.
 * Only writes sanitized tool status to garments_ops._setup_diagnostics.
 * This is NOT a public API and is NOT called on standard deployments.
 */
import { Client } from 'pg'
import { spawn } from 'node:child_process'
import { assertRuntimeConfig } from './garments-target-policy.mjs'
import { databaseCaFromEnv } from './garments-db-ca.mjs'
import { checkGarmentsConnection } from './garments-db-preflight.mjs'

const target=assertRuntimeConfig(process.env)
if(process.env.DB_SSL!=='true'||process.env.DB_SSL_REJECT_UNAUTHORIZED!=='true')
  throw Error('Strict TLS policy missing')
await checkGarmentsConnection()
const ca=databaseCaFromEnv()
const db=new Client({
 connectionString:process.env.DATABASE_URL,
 ssl:{rejectUnauthorized:true,...(ca?{ca}:{})},
 application_name:'premieros-garments-diagnostic-migration',
 connectionTimeoutMillis:8000,
 query_timeout:20000
})
await db.connect()
const label='20261012_mercato_migrate'
const record=async(stage,summary)=>{
 await db.query('INSERT INTO garments_ops._setup_diagnostics(run_tag,stage,summary) VALUES($1,$2,$3)',[label,stage,summary])
}
function sanitize(line) {
 if (/(?:password|secret|token|authorization|cookie|DATABASE_URL|JWT)/i.test(line))return '[credential-bearing line omitted]'
 return line.replace(/\x1b\[[\d;]*m/g,'')
  .replace(/postgres(?:ql)?:\/\/\S+/gi,'[database-url]')
  .replace(/[A-F0-9]{64,}/gi,'[opaque-value]')
  .trim().slice(0,450)
}
try {
 await db.query('CREATE TABLE IF NOT EXISTS garments_ops._setup_diagnostics (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, run_tag text NOT NULL, stage text NOT NULL, summary text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())')
 await record('started','Running Open Mercato module migrations under guarded garments_ops_login')
 let chunks=''
 const child=spawn('corepack',['yarn','run','db:migrate'],{env:process.env,stdio:['ignore','pipe','pipe']})
 const collect=(data)=>{
   chunks+=String(data)
   if(chunks.length>45000)chunks=chunks.slice(-30000)
 }
 child.stdout.on('data',collect)
 child.stderr.on('data',collect)
 const result=await new Promise((resolve,reject)=>{
   child.once('error',reject)
   child.once('close',(code,signal)=>resolve({code,signal}))
 })
 if(result.code!==0) {
  const items=chunks.split(/\r?\n/).map(sanitize).filter(s=>
    s && (/(?:error|failed|permission denied|cannot|not found|does not exist|syntax|migration|module)/i.test(s))
    && !s.startsWith('[credential-bearing'))
  const summary=(items.slice(-8).join(' | ')||'Child migration process exited without diagnostic lines').slice(0,2200)
  await record('failed_exit_'+String(result.code||'unknown'),summary)
  console.error('[garments] Migration failed; redacted summary stored in isolated setup diagnostics')
  process.exitCode=1
 } else {
  await record('completed','All enabled module migrations exited successfully')
  console.log('[garments] All enabled Open Mercato migrations exited successfully')
 }
} catch (err) {
 const code=String(err?.code||'WRAPPER_ERROR').replace(/[^A-Z0-9_]/gi,'').slice(0,45)
 await record('wrapper_error',code).catch(()=>{})
 console.error('[garments] Isolated migration wrapper error: '+code)
 process.exitCode=1
} finally {
 await db.end().catch(()=>{})
}
