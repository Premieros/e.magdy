import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const helper=fileURLToPath(new URL('../pilot/open-mercato/apply-vercel-pdfjs-tracing.mjs',import.meta.url))

test('Vercel SSR output must contain dynamically resolved pdfjs-dist metadata and PDF runtime assets',()=>{
 const folder=mkdtempSync(join(tmpdir(),'garments-pdfjs-'))
 try {
  const app=join(folder,'garments-ops')
  mkdirSync(app)
  const file=join(app,'next.config.ts')
  writeFileSync(file,"const nextConfig = {\n  serverExternalPackages: [\n    'jszip',\n  ],\n}\n")
  const run=spawnSync(process.execPath,[helper,file],{encoding:'utf8'})
  assert.equal(run.status,0,run.stderr)
  const config=readFileSync(file,'utf8')
  assert.match(config,/outputFileTracingIncludes:/)
  assert.match(config,/'\/\*': \[/)
  for(const asset of [
   './node_modules/pdfjs-dist/package.json',
   './node_modules/pdfjs-dist/legacy/build/**/*',
   './node_modules/pdfjs-dist/cmaps/**/*',
   './node_modules/pdfjs-dist/standard_fonts/**/*'
  ])assert.ok(config.includes(asset),'Missing '+asset)
  assert.match(config,/serverExternalPackages: \[/)
  // Refuse silently patching a changed upstream Next.js config twice.
  const repeated=spawnSync(process.execPath,[helper,file],{encoding:'utf8'})
  assert.notEqual(repeated.status,0)
 } finally {rmSync(folder,{recursive:true,force:true})}
})

test('upstream WMS scaffold applies PDF trace patch to new deployments',()=>{
 const scaffold=readFileSync(new URL('../pilot/open-mercato/bootstrap.sh',import.meta.url),'utf8')
 assert.match(scaffold,/apply-vercel-pdfjs-tracing\.mjs/)
 assert.match(scaffold,/next\.config\.ts/)
})
