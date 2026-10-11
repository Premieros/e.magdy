# خطة قاعدة بيانات PremierOS Garments

هذه النسخة لا تتصل حاليًا بأي قاعدة بيانات سحابية. تخزينها داخل المتصفح (localStorage) فقط ويصلح للتجارب على جهاز واحد.

## قاعدة البيانات المستقبلية
- organizations, organization_members, branches, warehouses, users, roles
- garment_styles, garment_sizes, garment_colors, garment_variants (SKU مستقل)
- materials, fabric_rolls, material_batches, inventory_ledger
- garment_bom_versions, garment_bom_lines
- garment_work_orders, work_order_variants, cutting_bundles
- operation_events, quality_checks, rework_events, labor_costs
- finished_goods_ledger, costing_postings, audit_log

## ضوابط ضرورية
1. عزل المؤسسة والمخزن والفرع عند جميع العمليات، وتفعيل RLS وصلاحيات الأدوار.
2. عدم استعمال user_metadata لمنح الصلاحيات.
3. خصم الخام وترحيل التام داخل معاملات قاعدة بيانات ذرية ذات مفاتيح منع تكرار.
4. لكل موديل أكواد أصناف مستقلة لكل مقاس ولون، مع فحص توازن عدد القطع والجودة والتالف.
5. مفاتيح الخدمة السرية لا تُحفظ في الواجهة. استخدم تسجيل دخول رسمي ونسخًا احتياطية.
6. يُمنع توجيه هذا المشروع إلى قاعدة PremierOS القديمة.

## الخطوة التالية
إنشاء أو تفعيل مشروع PostgreSQL/Supabase مستقل، ثم إعداد مخطط SQL قابل للمراجعة، واختبارات RLS، وخطة نقل بيانات محلية تجريبية قبل إتاحة بيئة إنتاج.
