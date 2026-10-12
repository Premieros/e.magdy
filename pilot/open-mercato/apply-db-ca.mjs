import {readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
const root=resolve(process.argv[2]||'')
if(!root.endsWith('/garments-ops'))throw Error('Unexpected scaffold target')
const instrument=resolve(root,'src/instrumentation.ts')
const existing=readFileSync(instrument,'utf8')
const anchor='export async function register(): Promise<void> {'
if(existing.split(anchor).length!==2)throw Error('Upstream instrumentation signature changed')
const fragment=anchor+"\n  if (process.env.NEXT_RUNTIME === 'nodejs') {\n    const { installGarmentsDbCa } = await import('../scripts/garments-db-ca.mjs')\n    installGarmentsDbCa()\n  }"
writeFileSync(instrument,existing.replace(anchor,fragment))
const cli=resolve(root,'scripts/mercato-cli.mjs')
const src=readFileSync(cli,'utf8')
const probe="import fs from 'node:fs'"
if(src.split(probe).length!==2)throw Error('Upstream CLI launcher signature changed')
writeFileSync(cli,src.replace(probe,"import { installGarmentsDbCa } from './garments-db-ca.mjs'\n"+probe+"\ninstallGarmentsDbCa()"))
