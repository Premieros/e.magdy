import type { Dict } from '@open-mercato/shared/lib/i18n/context'

const PUBLIC_ROUTES = new Set(['/', '/login', '/reset', '/start', '/terms', '/privacy'])
const PUBLIC_PREFIXES = ['auth.login.', 'auth.reset.', 'auth.password.', 'auth.roles.', 'common.', 'notices.', 'ui.inputs.', 'startPage.', 'app.page.', 'api.errors.']
const PUBLIC_KEYS = new Set(['auth.email', 'auth.password', 'auth.signIn', 'auth.resetPassword', 'auth.sendResetLink'])

/** Root chrome needs only shared/public keys. Backend has its own complete provider. */
export function selectClientDictionary(pathname: string, dictionary: Dict): Dict {
  const hasBackendProvider = pathname === '/backend' || pathname.startsWith('/backend/')
  if (!PUBLIC_ROUTES.has(pathname) && !hasBackendProvider) return dictionary
  return Object.fromEntries(Object.entries(dictionary).filter(([key]) =>
    PUBLIC_KEYS.has(key) || PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix)),
  ))
}
