#!/usr/bin/env node
// Read-only inventory of app-owned routes; package-owned Open Mercato routes
// must be obtained from official generated registry during integration tests.
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const root = process.cwd()
const candidates = ['src/app', 'src/modules']
const entries = []

async function visit(directory) {
  let items
  try { items = await readdir(join(root, directory), { withFileTypes: true }) }
  catch (error) { if (error.code === 'ENOENT') return; throw error }
  for (const item of items) {
    if (item.name === 'node_modules' || item.name === '.mercato') continue
    const path = join(directory, item.name)
    if (item.isDirectory()) await visit(path)
    else if (item.isFile() && (/^page\.(tsx|jsx|ts|js)$/.test(item.name) || item.name === 'page.meta.ts')) {
      const route = relative('src', path).split(sep).join('/')
      entries.push({ file: route, kind: item.name === 'page.meta.ts' ? 'metadata' : 'page' })
    }
  }
}
for (const path of candidates) await visit(path)
entries.sort((a, b) => a.file.localeCompare(b.file))
const output = {
  scope: 'app-owned routes only; installed package routes not included',
  count: entries.length,
  entries,
}
process.stdout.write(JSON.stringify(output, null, 2) + '\n')
