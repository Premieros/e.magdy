import { getAuthFromCookies } from '@open-mercato/shared/lib/auth/server'
import { NativeSetupWorkspace } from '../../../components/NativeSetupWorkspace'

export default async function PremierNativeSetupPage() {
  const auth = await getAuthFromCookies()
  if (!auth?.sub) return null
  return <NativeSetupWorkspace userId={auth.sub} />
}
