import { describe, expect, it } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('browser translation safe native i18n root', () => {
  it('disables external DOM rewriting while retaining locale and RTL support', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/layout.tsx'), 'utf8')
    expect(source).toContain('lang={locale}')
    expect(source).toContain("dir={locale === 'ar' ? 'rtl' : 'ltr'}")
    expect(source).toContain('translate="no"')
    expect(source).toContain('className="notranslate"')
  })
})
