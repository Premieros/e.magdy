# تشغيل PremierOS Garments على Vercel — حالة التسليم

**حالة مثبتة بتاريخ 2026-10-11:** مصدر Open Mercato 0.9.0 / WMS موجود في فرع `deploy/garments-mercato` بمجلد `open-mercato/`. مشروع Vercel `premieros-garments-mercato` موجود لكن **غير مرتبط بـGitHub، بلا نشر فعلي**. يمنع نشر نسخة إنتاج إلى أن تختبر قاعدة البيانات كاملة.

## العنوان الوحيد المسموح

- Supabase project ref: `yumeijsyiphzdsulsubf`.
- DB host: `db.yumeijsyiphzdsulsubf.supabase.co`.
- DB: `postgres`.
- Schema: `garments_ops`. **لا تسمح لـOpen Mercato باستخدام `public`**.
- Role: `garments_ops_login`. الآن `NOLOGIN` حتى يُجهز اتصال آمن.
- Existing public AMMCO tables and the original POS are not to be modified.

## المطلوب من صاحب الحساب: ربط GitHub

1. افتح https://vercel.com/dashboard ثم مشروع **premieros-garments-mercato** الموجود بالفعل.
2. اربط GitHub من **Project Settings → Git**. إذا طلب Vercel تثبيت GitHub App، اسمح له بقراءة المستودع **Premieros/e.magdy** فقط؛ لا توسع الإذن إلى مستودعات أخرى.
3. اختر فرع النشر **`deploy/garments-mercato`** واجعل **Root Directory = `open-mercato`**. لا تستخدم `main` لنسخة Open Mercato، لأن `main` يشغّل واجهة GitHub Pages القديمة.
4. اترك حماية المعاينات مفعّلة؛ لا تعلن رابطًا عامًا لاستقبال الطلبات قبل الاختبارات.

من دون موافقة مالك حساب GitHub/Vercel على الربط، لا تستطيع الاتصالات الحالية إكمال هذه الخطوة. لا تُنشئ مشروع Supabase ثانيًا.

## إصلاح تكرار سجل الترحيلات أثناء الاستئناف

إذا ظهر `relation "mikro_orm_migrations_attachments" already exists` بعد نجاح أول دفعة ترحيلات، لا تحذف جدول السجل. **MikroORM v7** يحدد مخطط سجله افتراضيًا وفق خيار `schema`، حتى عندما يحدد اتصال PostgreSQL `search_path` مختلفًا. في هذا المشروع يجب ضبط المتغير `MIKRO_ORM_SCHEMA=garments_ops` مع `GARMENTS_DB_SCHEMA=garments_ops`. يرفض فحص التشغيل الآن أي مخطط مختلف أو غياب هذا الإعداد.

الترحيلات لا تُشغّل عند استقبال طلبات المستخدمين ولا عند كل بناء اعتيادي؛ استخدم أمر تهيئة صريحًا ومراجعًا يعمل بحساب `garments_ops_login` المقيد فقط، وتجنب عمليات تهيئة متزامنة. يمكن أن تتوقف إضافات WMS عند ترحيلات تخص وحدات اختيارية ليست ضمن الـpreset؛ عندها افحص السجلات وجداول المخطط أولًا، ولا تعطل فحوص العزل أو تُفرغ سجلات الترحيلات.

## Supabase root CA — حل شهادة SSL بدون تعطيل التحقق

إذا أظهر مسار `/api/garments-health` الخطأ `SELF_SIGNED_CERT_IN_CHAIN`، فهذا يعني أن شهادة مصدر الثقة غير متاحة للعملية في Node.

1. افتح لوحة مشروع Supabase **الوحيد**: https://supabase.com/dashboard/project/yumeijsyiphzdsulsubf/settings/database
2. ابحث عن **SSL Configuration** ثم **Download certificate / Server root certificate**. وفقًا لتوثيق Supabase الرسمي: https://supabase.com/docs/guides/database/psql#connecting-with-ssl
3. تأكد أن الملف شهادة CA *عامة* بصيغة PEM تبدأ بـ `-----BEGIN CERTIFICATE-----` وتنتهي بـ `-----END CERTIFICATE-----`. لا تستخدم كلمات مرور أو مفاتيح خاصة.
4. في مشروع Vercel `premieros-garments-mercato` أضف متغير **Production** بالاسم `GARMENTS_DB_CA_PEM`، وقيمته كامل نص شهادة CA التي نزّلتها رسميًا (يمكن الاحتفاظ بأسطر PEM أو تمثيلها بـ `\\n`). يمكن حفظها Sensitive.
5. اترك `DB_SSL=true` و`DB_SSL_REJECT_UNAUTHORIZED=true`، ويفضل إبقاء `NODE_USE_SYSTEM_CA=1` أيضًا. **ممنوع استخدام `NODE_TLS_REJECT_UNAUTHORIZED=0` أو `rejectUnauthorized:false`**.
6. أعد نشر فرع `deploy/garments-mercato`، ثم افتح `/api/garments-health`. إذا ظهرت `initialization_required` فهذا نجاح لفحص الاتصال فقط، وليس تهيئة ERP.
7. إذا ظهر `CERT_HAS_EXPIRED` أو `UNABLE_TO_VERIFY_LEAF_SIGNATURE` بعد ذلك، راجع سلسلة شهادة CA للـSession pooler ولا تُعطّل التحقق.

يستخدم Open Mercato شهادة CA من `GARMENTS_DB_CA_PEM` على خادم Next.js وCLI فقط، ويضيفها إلى شهادات Node الموثوقة بدل استبدالها. وفحص الاتصال يعرض رمز الخطأ فقط دون معلومات حساسة.

**ملاحظة:** لا يمكن لاتصال أدوات المشروع تنزيل شهادة الجذر الخاصة بالمشروع مباشرةً من لوحة Supabase؛ يلزم تنزيلها من حساب المالك لتحديد مصدرها الموثوق.

## أسرار التشغيل: أدخلها في لوحات الحسابات فقط

Vercel Project Settings → Environment Variables:

| المتغير | القيمة أو التوصية |
|---|---|
| `SUPABASE_PROJECT_REF` | `yumeijsyiphzdsulsubf` **(موجود)** |
| `GARMENTS_DB_SCHEMA` | `garments_ops` **(موجود)** |
| `MIKRO_ORM_SCHEMA` | `garments_ops` — إلزامي؛ يوجّه سجلات ترحيلات MikroORM إلى المخطط المعزول |
| `DATABASE_URL` | رابط PostgreSQL باستخدام دور `garments_ops_login` وكلمة مروره الخاصة |
| `DB_SSL` | `true` |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` |
| `JWT_SECRET` | سر عشوائي فريد لا يقل عن 32 حرفًا |
| `AUTH_SECRET` | سر عشوائي *مختلف* وفريد لا يقل عن 32 حرفًا |
| `APP_URL` | رابط النشر الحقيقي، بعد نجاح إنشاء أول نشر |

مثال **هيكلي فقط دون أي كلمة مرور حقيقية**:

```text
postgresql://garments_ops_login:PRIVATE_PASSWORD@db.yumeijsyiphzdsulsubf.supabase.co:5432/postgres?options=-c%20search_path%3Dgarments_ops
```

استخدم كلمة مرور مولدة عشوائيًا للدور `garments_ops_login`، فعّل `LOGIN` على هذا الدور عبر Supabase SQL Editor بعد إعداد السر، وأدخل الرابط في Vercel كمتغير **Encrypted/Sensitive**. **لا ترسل أسرارًا في المحادثة، ولا تضعها في GitHub أو الشيفرة أو رابط طلب عام**. لا تستخدم كلمة مرور حساب `postgres` الإداري، ولا `service_role` الخاص بـSupabase.

إذا كان اتصال `db.*` المباشر غير متاح من بيئة الاستضافة، استعمل إعداد Supabase Pooler الرسمي المعروض داخل **Connect** في نفس مشروع `yumeijsyiphzdsulsubf` مع دور هذا المشروع فقط، ولا تخمن اسم المضيف. سيُرفض أي عنوان لا يطابق سياسة [target-policy.mjs](target-policy.mjs).

## التثبيت والتحقق — لا تشغّل إعادة التثبيت المدمرة

1. اختبر `node scripts/garments-target-policy.mjs` تحت أسرار التشغيل. يجب أن يُظهر `yumeijsyiphzdsulsubf / garments_ops` من دون بيانات حساسة.
2. من جلسة صيانة مؤمّنة، افحص `SELECT current_schema();` و `SELECT current_user;`. يجب أن تكون `garments_ops` و `garments_ops_login`. أثبت عمليًا رفض الوصول إلى جداول AMMCO العامة قبل الترحيل.
3. ثبّت حزم Open Mercato في بيئة منفصلة بنسخ مثبتة (Node 24) ثم راجع الترحيلات وخطة الرجوع والنسخ الاحتياطي؛ شغّل فقط الترحيلات المعتمدة داخل `garments_ops`. **لا تشغّل `setup:reinstall` أو `reinstall` أو `dev:reset`**.
4. اختبر `yarn generate` و`yarn typecheck` و`yarn build`، ثم هوية المصنع والصلاحيات والمنتجات والمخزون وطلبات البيع، ثم دورة تصنيع الملابس حين تستكمل وحدتها.
5. انتبه: Open Mercato يمتلك منظومة تسجيل دخول مستقلة؛ حساب Supabase السابق لا ينتقل تلقائيًا. يجب توفير مستخدم مدير جديد آمن في هوية Open Mercato وإجراء اختبار دخول حقيقي.

**ما لم يُنجز بعد:** استضافة قابلة للفتح، إعداد الأسرار الخاصة، صلاحية LOGIN، تشغيل ترحيلات Open Mercato، تهيئة المستخدمين، وربط القص والخياطة والجودة. لا توصف النسخة الحالية بأنها نظام مصنع تشغيلي مكتمل.

## نتائج الاختبارات

- تم توليد حزمة Open Mercato 0.9.0 الرسمية على GitHub Actions.
- تم دفع كودها إلى فرع `deploy/garments-mercato` بنجاح.
- تم اختبار رفض إعداد Supabase غير المصرح به.
- لم تحدث كتابة واحدة إلى مخطط `public` بسبب تشغيل Open Mercato؛ دور قاعدة بيانات الملابس ممنوع من إنشاء جداول فيه.
- حالة إعداد Vercel مستندة إلى واجهة المشروع: موجود لكن دون Git link أو Deployment.

**الوثائق الفنية:** [قرار قاعدة البيانات الوحيدة](README.md)، [خريطة نقل البيانات](domain-map.json)، [نسخة ترخيص MIT](THIRD_PARTY_LICENSE.txt).
