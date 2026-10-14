export const metadata = {
  requireAuth: true,
  requireFeatures: ['wms.view'],
  pageTitle: 'Stock operations', pageTitleKey: 'premier_pos.stockTitle',
  pageGroup: 'Warehouse', pageGroupKey: 'wms.nav.group',
  pageOrder: 83, icon: 'package-check',
  breadcrumb: [
    { label: 'Point of sale', labelKey: 'premier_pos.title', href: '/backend/pos' },
    { label: 'Stock operations', labelKey: 'premier_pos.stockTitle' },
  ],
} as const
