import { jest, test, expect } from '@jest/globals'
import { selectClientDictionary } from '../client-dictionary'
const dict = { 'auth.login.subtitle': 'Access', 'auth.email': 'Email', 'auth.password': 'Password', 'auth.signIn': 'Sign in', 'auth.roles.superadmin': 'Admin', 'auth.reset.title': 'Reset', 'ui.inputs.passwordInput.show': 'Show', 'common.language': 'Language', 'notices.demo.title': 'Demo', 'customers.people.list.title': 'People', 'sales.orders.list.title': 'Orders', 'premier_pos.title': 'POS' }
test('known login routes retain required controls while excluding unrelated business dictionaries', () => {
  const filtered = selectClientDictionary('/login', dict)
  for (const key of ['auth.email', 'auth.password', 'auth.signIn', 'auth.roles.superadmin', 'ui.inputs.passwordInput.show', 'common.language', 'notices.demo.title']) expect(filtered[key]).toBe(dict[key as keyof typeof dict])
  expect(filtered['customers.people.list.title']).toBeUndefined()
  expect(filtered['premier_pos.title']).toBeUndefined()
})
test('protected and unknown extension routes keep complete dictionaries by identity', () => {
  for (const path of ['/backend', '/backend/pos', '/backend/sales/orders', '/custom-public-page']) expect(selectClientDictionary(path, dict)).toBe(dict)
})
