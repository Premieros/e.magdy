import { getAuthFromCookies } from '@open-mercato/shared/lib/auth/server'
import { OrderLifecycleWorkspace } from '../../../components/OrderLifecycleWorkspace'

export default async function PosOrderLifecyclePage() {
  const auth = await getAuthFromCookies()
  if (!auth?.sub) return null
  return <OrderLifecycleWorkspace userId={auth.sub} />
}
