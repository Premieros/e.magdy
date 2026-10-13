export const metadata = {
  requireAuth: true,
  requireFeatures: ['sales.orders.manage', 'sales.orders.view', 'catalog.products.view', 'sales.channels.view', 'sales.invoices.manage', 'sales.payments.manage'],
  pageTitle: 'Point of sale', pageTitleKey: 'premier_pos.title',
  pageGroup: 'Sales', pageGroupKey: 'customers~sales.nav.group',
  pageOrder: 80, icon: 'shopping-cart',
  breadcrumb: [{ label: 'Point of sale', labelKey: 'premier_pos.title' }],
} as const
