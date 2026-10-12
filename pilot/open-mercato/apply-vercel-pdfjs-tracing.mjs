// Patch only the pinned 0.9.0 Open Mercato Next config.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const file = resolve(process.argv[2] || '')
if (!file.endsWith('/garments-ops/next.config.ts')) {
  throw Error('Unexpected WMS scaffold path')
}
const code = readFileSync(file, 'utf8')
if (code.includes('outputFileTracingIncludes:')) {
  throw Error('Upstream tracing policy changed: manual review required')
}
const anchor='  serverExternalPackages: ['
if (code.split(anchor).length!==2) throw Error('Unexpected Next serverExternalPackages config')
const extra=`  // Upstream attachments/textExtraction and pdfProcessing resolve
  // pdfjs-dist/package.json dynamically at module evaluation time.
  // Next output tracing misses this runtime resource in Vercel SSR bundles.
  outputFileTracingIncludes: {
    '/*': [
      './node_modules/pdfjs-dist/package.json',
      './node_modules/pdfjs-dist/legacy/build/**/*',
      './node_modules/pdfjs-dist/cmaps/**/*',
      './node_modules/pdfjs-dist/standard_fonts/**/*',
    ],
  },
`
writeFileSync(file,code.replace(anchor,extra+anchor))
