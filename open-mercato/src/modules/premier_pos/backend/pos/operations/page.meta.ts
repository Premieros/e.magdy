export const metadata = {
  requireAuth: true,
  requireFeatures: ['sales.orders.view'],
  pageTitle: 'Order lifecycle', pageTitleKey: 'premier_pos.traceTitle',
  pageGroup: 'Sales', pageGroupKey: 'customers~sales.nav.group',
  pageOrder: 81, icon: 'list-checks',
  breadcrumb: [
    { label: 'Point of sale', labelKey: 'premier_pos.title', href: '/backend/pos' },
    { label: 'Order lifecycle', labelKey: 'premier_pos.traceTitle' },
  ],
} as const
