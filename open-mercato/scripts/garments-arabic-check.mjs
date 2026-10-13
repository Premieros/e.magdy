// Run with: node --import tsx scripts/garments-arabic-check.mjs
// Exercises the installed i18n and locale API without database access.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import '../src/lib/i18n/register-dictionary-loader.ts'
import { getSupportedLocales, loadDictionary } from '@open-mercato/shared/lib/i18n/server'
import { createTranslator } from '@open-mercato/shared/lib/i18n/translate'
import { POST } from '@open-mercato/core/modules/auth/api/locale/route'

const reviewed = JSON.parse(fs.readFileSync(new URL('../src/i18n/ar.json', import.meta.url), 'utf8'))
const english = await loadDictionary('en')
const arabic = await loadDictionary('ar')
const tokens = (value) => [...value.matchAll(/\{\{[^{}]+\}\}|\{[^{}]+\}|%[sdif]/g)].map(([match]) => match).sort()

assert.ok(getSupportedLocales().includes('ar'))
assert.equal(new Intl.DisplayNames(['ar'], { type: 'language' }).of('ar'), 'العربية')
for (const [key, value] of Object.entries(reviewed)) {
  assert.ok(typeof value === 'string' && value.length > 0, key)
  if (key === 'common.languages.arabic') continue
  assert.ok(key in english, `Unknown translation key: ${key}`)
  assert.deepEqual(tokens(value), tokens(english[key]), `Interpolation changed: ${key}`)
}
for (const key of Object.keys(english).filter((key) => key.includes('.nav.') || key.startsWith('auth.login.') || key.startsWith('appShell.'))) {
  assert.ok(key in reviewed, `Missing primary UI translation: ${key}`)
}
assert.equal(arabic['auth.signIn'], 'تسجيل الدخول')
assert.equal(createTranslator(arabic)('ui.dataTable.pagination.pageInfo', { page: 2, totalPages: 5 }), 'الصفحة 2 من 5')
assert.equal(createTranslator(arabic)('appShell.version', { version: '0.9.0' }), 'الإصدار 0.9.0')
const fallbackKey = Object.keys(english).find((key) => !(key in reviewed))
assert.ok(fallbackKey)
assert.equal(arabic[fallbackKey], english[fallbackKey])

for (const locale of ['ar', 'en', 'ar-EG']) {
  const response = await POST(new Request('https://example.invalid/api/auth/locale', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale }),
  }))
  assert.equal(response.status, 200, locale)
  assert.equal(response.cookies.get('locale')?.value, locale === 'en' ? 'en' : 'ar')
  assert.deepEqual(await response.json(), { ok: true })
}
const invalid = await POST(new Request('https://example.invalid/api/auth/locale', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: 'invalid' }),
}))
assert.equal(invalid.status, 400)
assert.equal(invalid.cookies.get('locale'), undefined)
console.log(`Arabic checks passed: ${Object.keys(reviewed).length} reviewed entries, placeholders, primary navigation, English fallback and official locale API.`)
