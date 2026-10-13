import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nProvider, useT } from '@open-mercato/shared/lib/i18n/context'
import { test, expect } from '@jest/globals'
import { selectClientDictionary } from '../client-dictionary'
const dict = { 'auth.login.subtitle': 'Access', 'auth.email': 'Email', 'auth.password': 'Password', 'auth.signIn': 'Sign in', 'auth.sendResetLink': 'Send reset link', 'auth.roles.superadmin': 'Admin', 'auth.reset.title': 'Reset', 'ui.inputs.passwordInput.show': 'Show', 'common.language': 'Language', 'notices.demo.title': 'Demo', 'customers.people.list.title': 'People', 'sales.orders.list.title': 'Orders', 'premier_pos.title': 'POS' }
test('known login routes retain required controls while excluding unrelated business dictionaries', () => {
  const filtered = selectClientDictionary('/login', dict)
  for (const key of ['auth.email', 'auth.password', 'auth.signIn', 'auth.sendResetLink', 'auth.roles.superadmin', 'ui.inputs.passwordInput.show', 'common.language', 'notices.demo.title']) expect(filtered[key]).toBe(dict[key as keyof typeof dict])
  expect(filtered['customers.people.list.title']).toBeUndefined()
  expect(filtered['premier_pos.title']).toBeUndefined()
})
test('unknown extension routes keep complete dictionaries by identity', () => {
  for (const path of ['/custom-public-page', '/backend-extension']) expect(selectClientDictionary(path, dict)).toBe(dict)
})


test('backend root chrome excludes business dictionaries handled by its nested provider', () => {
  for (const path of ['/backend', '/backend/pos', '/backend/sales/orders']) {
    const filtered = selectClientDictionary(path, dict)
    expect(filtered['common.language']).toBe('Language')
    expect(filtered['sales.orders.list.title']).toBeUndefined()
  }
})

test('full nested backend translations and outer notices survive a slim root dictionary', () => {
  function Label({ name }: { name: string }) { return createElement('span', null, useT()(name)) }
  const html = renderToStaticMarkup(createElement(I18nProvider, { locale: 'ar', dict: selectClientDictionary('/backend', dict) },
    createElement(Label, { name: 'notices.demo.title' }),
    createElement(I18nProvider, { locale: 'ar', dict }, createElement(Label, { name: 'sales.orders.list.title' })),
  ))
  expect(html).toBe('<span>Demo</span><span>Orders</span>')
})
