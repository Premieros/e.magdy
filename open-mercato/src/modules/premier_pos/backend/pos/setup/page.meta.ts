export const metadata = {
  requireAuth: true,
  requireFeatures: ['sales.orders.manage'],
  pageTitle: 'POS setup', pageTitleKey: 'premier_pos.setupTitle',
  pageGroup: 'Sales', pageGroupKey: 'customers~sales.nav.group',
  pageOrder: 82, icon: 'settings-2',
  breadcrumb: [
    { label: 'Point of sale', labelKey: 'premier_pos.title', href: '/backend/pos' },
    { label: 'Setup', labelKey: 'premier_pos.setupTitle' },
  ],
} as const
