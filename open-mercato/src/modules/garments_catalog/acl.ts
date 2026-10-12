/** Reserved for a future authenticated P1 matrix preview route. */
export const features = [
  {
    id: 'garments_catalog.matrix.view',
    title: 'View garment SKU production-planning matrix',
    module: 'garments_catalog',
    dependsOn: ['catalog.products.view'],
  },
]

export default features
