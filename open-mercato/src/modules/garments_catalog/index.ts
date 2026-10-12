import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

/** P1-only: no database entities, UI routes, or inventory postings. */
export const metadata: ModuleInfo = {
  name: 'garments_catalog',
  title: 'PremierOS Garments Catalog',
  version: '0.1.0',
  description: 'Catalog-owned garment SKU grid validation and manufacturing planning preview.',
  author: 'PremierOS',
  license: 'MIT',
}
