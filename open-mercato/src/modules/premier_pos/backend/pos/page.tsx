import { getAuthFromCookies } from '@open-mercato/shared/lib/auth/server'
import { PosWorkspace } from '../../components/PosWorkspace'

export default async function PointOfSalePage() {
  const auth = await getAuthFromCookies()
  if (!auth?.sub) return null
  return <PosWorkspace userId={auth.sub} />
}
