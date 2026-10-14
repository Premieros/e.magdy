import { getAuthFromCookies } from '@open-mercato/shared/lib/auth/server'
import { StockOperationsWorkspace } from '../../../components/StockOperationsWorkspace'

export default async function PosStockOperationsPage() {
  const auth = await getAuthFromCookies()
  if (!auth?.sub) return null
  return <StockOperationsWorkspace userId={auth.sub} />
}
