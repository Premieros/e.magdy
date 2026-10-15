export const metadata = {
  requireAuth: true,
  requireFeatures: ['catalog.products.view'],
  pageTitle: 'Sage catalog parity', pageTitleKey: 'premier_pos.parityTitle',
  pageGroup: 'Catalog', pageGroupKey: 'catalog.nav.group',
  pageOrder: 84, icon: 'scan-search',
  breadcrumb: [
    { label: 'Point of sale', labelKey: 'premier_pos.title', href: '/backend/pos' },
    { label: 'Sage catalog parity', labelKey: 'premier_pos.parityTitle' },
  ],
} as const
