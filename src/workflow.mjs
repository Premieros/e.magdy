/* White tex — shared stage definitions for GitHub Pages and local production data.
 * Stable status keys protect existing local snapshots; never rewrite stored orders.
 */
export const stages = Object.freeze([
  'planned', 'cutting', 'initial_sorting', 'production_line', 'sewing', 'finishing',
  'quality', 'printing', 'ironing', 'presentation_quality', 'packing', 'completed'
]);
export const labels = Object.freeze({
  planned: 'مخطط', cutting: 'القص', initial_sorting: 'فرز بدائي',
  production_line: 'خط الإنتاج', sewing: 'الخياطة', finishing: 'التشطيب',
  quality: 'فحص الجودة', printing: 'الطباعة', ironing: 'المكواة',
  presentation_quality: 'جودة البرزنتيشن', packing: 'التعبئة',
  completed: 'مكتمل', cancelled: 'ملغي'
});
export const workStages = Object.freeze(stages.filter(stage =>
  !['planned', 'quality', 'completed'].includes(stage)
));
export const afterQualityStages = Object.freeze([
  'printing', 'ironing', 'presentation_quality', 'packing'
]);
export const stageTargetQuantity = (order, stage = order.status) =>
  afterQualityStages.includes(stage) ? order.good : order.qty;
export const nextStageAction = Object.freeze({
  planned: 'بدء القص وصرف الخامات',
  cutting: 'الانتقال إلى الفرز البدائي',
  initial_sorting: 'الانتقال إلى خط الإنتاج',
  production_line: 'الانتقال إلى الخياطة',
  sewing: 'الانتقال إلى التشطيب',
  finishing: 'الانتقال إلى فحص الجودة',
  quality: 'إرسال إلى الطباعة',
  printing: 'إرسال إلى المكواة',
  ironing: 'إرسال إلى جودة البرزنتيشن',
  presentation_quality: 'إرسال إلى التعبئة',
  packing: 'إتمام الإنتاج وترحيل المخزون'
});
