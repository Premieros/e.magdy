import { getAuthFromCookies } from '@open-mercato/shared/lib/auth/server'
import { SageCatalogParityCenter } from '../../../components/SageCatalogParityCenter'

export default async function SageCatalogParityPage() {
  const auth = await getAuthFromCookies()
  if (!auth?.sub) return null
  return <SageCatalogParityCenter userId={auth.sub} />
}
