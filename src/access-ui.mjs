/* UI for preparing White tex users and permissions before login is enabled. */
import {PERMISSION_GROUPS,PERMISSIONS,permissionPreview} from './access-control.mjs';
export function accessPage(db,{heading,btn,esc,table,td,empty}){
  const roles=db.appRoles,users=db.appUsers;
  const active=users.filter(u=>u.active).length;
  const assigned=new Map(roles.map(role=>[role.id,users.filter(u=>u.roleId===role.id).length]));
  const userRows=users.map(user=>{
    const role=roles.find(role=>role.id===user.roleId);
    return '<tr>'+td('<strong>'+esc(user.name)+'</strong>'+(user.email?'<small class="access-muted">'+esc(user.email)+'</small>':''))
      +td('<span class="access-role-name">'+esc(role?.name||'غير محدد')+'</span>')
      +td('<span class="access-status '+(user.active?'access-on':'access-off')+'">'+(user.active?'نشط':'موقوف')+'</span>')
      +td('<div class="access-actions">'
        +btn('تعديل','access-edit-user',user.id)
        +btn(user.active?'إيقاف':'تفعيل','access-toggle-user',user.id)
        +'</div>')+'</tr>';
  }).join('');
  const roleCards=roles.map(role=>
    '<article class="access-role-card">'
    +'<div class="access-role-top"><div><strong>'+esc(role.name)+'</strong><p>'+esc(role.description||'دور محدد الصلاحيات')+'</p></div>'
    +'<span class="access-role-count">'+role.permissions.length+' صلاحية</span></div>'
    +'<p class="access-people">'+(assigned.get(role.id)||0)+' مستخدم مسجل</p>'
    +'<div class="access-role-permissions">'
    +permissionPreview(db,role.id).slice(0,5).map(label=>'<span>'+esc(label)+'</span>').join('')
    +(role.permissions.length>5?'<span>و'+(role.permissions.length-5)+' أخرى</span>':'')
    +'</div><div class="access-role-buttons">'
    +(role.locked?'<span class="access-lock"><span aria-hidden="true">◈</span> صلاحيات المالك ثابتة</span>'
       :btn('تعديل الصلاحيات','access-edit-role',role.id))
    +(!role.locked&&!['manager','production','warehouse','quality','sales','accountant','viewer'].includes(role.id)
       ?btn('حذف الدور','access-remove-role',role.id,'danger'):'')
    +'</div></article>').join('');
  return heading('المستخدمون والصلاحيات','تعريف الموظفين وتوزيع مسؤولياتهم حسب طبيعة عملهم، دون شاشة تسجيل دخول.',
     btn('＋ إضافة مستخدم','access-new-user','','primary')+btn('＋ دور جديد','access-new-role'))
    +'<section class="access-unlocked" role="note"><span class="access-note-icon" aria-hidden="true">◉</span>'
    +'<div><strong>الموقع مفتوح للجميع حاليًا — لم نفعّل تسجيل الدخول</strong>'
    +'<p>الأدوار والصلاحيات هنا إعدادات تمهيدية فقط، وليست حماية فعلية للصفحات أو البيانات. عند طلبك إضافة شاشة الدخول سنربط كل مستخدم بهويته ونفعّل التحقق من الصلاحيات على الخادم.</p>'
    +'</div></section>'
    +'<div class="access-summary"><div><small>المستخدمون</small><strong>'+users.length+'</strong><span>حسابات معدّة</span></div>'
    +'<div><small>النشطون</small><strong>'+active+'</strong><span>موظفون جاهزون</span></div>'
    +'<div><small>الأدوار</small><strong>'+roles.length+'</strong><span>مجموعات الصلاحيات</span></div>'
    +'<div><small>وضع الوصول</small><strong class="access-open-text">مفتوح</strong><span>بدون تسجيل دخول</span></div></div>'
    +'<section class="card"><div class="access-section-head"><div><h3>قائمة المستخدمين</h3><p>أضف الاسم والبريد اختياريًا وحدد دور كل شخص. لا توجد كلمات مرور.</p></div>'+btn('＋ مستخدم','access-new-user','','primary')+'</div>'
    +(userRows?table(['المستخدم','الدور','الحالة',''],userRows)
       :empty('لا يوجد مستخدمون بعد','أضف مالك النظام أولًا، ثم أضف باقي الموظفين وحدد أدوارهم.'))
    +'</section>'
    +'<section class="card"><div class="access-section-head"><div><h3>الأدوار ومسؤولياتها</h3><p>أدوار جاهزة يمكنك تعديل صلاحياتها، أو إنشاء دور جديد للعمل المناسب.</p></div>'+btn('＋ دور جديد','access-new-role')+'</div>'
    +'<div class="access-roles-grid">'+roleCards+'</div></section>'
    +'<section class="card"><h3>دليل الصلاحيات</h3><p class="notes">يمكن توزيع صلاحيات القراءة أو التعديل لكل قسم من النظام، كما تظهر في إعدادات الأدوار.</p>'
    +'<div class="access-directory">'+PERMISSION_GROUPS.map(group=>'<div><strong>'+esc(group.name)+'</strong>'
      +group.items.map(([,label])=>'<span>'+esc(label)+'</span>').join('')+'</div>').join('')+'</div></section>';
}
export function accessUserForm(db,esc,userId=''){
  const user=userId?db.appUsers.find(x=>x.id===userId):null;
  if(userId&&!user)throw Error('المستخدم غير موجود');
  const selected=user?.roleId||(!db.appUsers.length?'owner':'');
  return '<p class="notes">لا يتم إنشاء كلمة مرور أو حساب دخول الآن؛ هذه بطاقة موظف لتجهيز الصلاحيات لاحقًا.</p>'
    +'<div class="form-grid">'
    +'<label class="field">اسم الموظف<input name="name" required maxlength="100" value="'+esc(user?.name||'')+'" placeholder="اسم الموظف"></label>'
    +'<label class="field">البريد الإلكتروني (اختياري)<input name="email" type="email" maxlength="160" autocomplete="off" value="'+esc(user?.email||'')+'" placeholder="يمكن إضافته لاحقًا"></label>'
    +'<label class="field">الدور<select name="roleId" required>'
    +'<option value="">اختر دور الموظف</option>'
    +db.appRoles.map(role=>'<option value="'+esc(role.id)+'" '+(role.id===selected?'selected':'')+'>'+esc(role.name)+'</option>').join('')
    +'</select></label></div>'
    +(!user&&db.appUsers.length===0?'<p class="tips">يجب إضافة مالك واحد على الأقل في البداية للمحافظة على إعدادات الإدارة.</p>':'');
}
export function accessRoleForm(db,esc,roleId=''){
  const role=roleId?db.appRoles.find(x=>x.id===roleId):null;
  if(roleId&&!role)throw Error('الدور غير موجود');
  if(role?.locked)throw Error('لا يمكن تعديل صلاحيات المالك');
  const selected=new Set(role?.permissions||[]);
  return '<p class="notes">يمكنك تعديل الصلاحيات الخاصة بالدور، لكنها لن تمنع أحدًا من استخدام الموقع حتى يتم تفعيل نظام الدخول.</p>'
    +'<div class="form-grid"><label class="field">اسم الدور<input name="name" required maxlength="70" value="'+esc(role?.name||'')+'" placeholder="مثال: مشرف الطباعة"></label>'
    +'<label class="field">وصف الدور<input name="description" maxlength="180" value="'+esc(role?.description||'')+'" placeholder="ما المسؤوليات المخصصة له؟"></label></div>'
    +'<div class="access-permissions-form">'+PERMISSION_GROUPS.map(group=>
      '<fieldset class="access-permission-group"><legend>'+esc(group.name)+'</legend>'
      +group.items.map(([key,label])=>'<label class="access-perm-label"><input type="checkbox" name="permission" value="'+esc(key)+'" '
        +(selected.has(key)?'checked':'')+'><span>'+esc(label)+'</span></label>').join('')
      +'</fieldset>').join('')+'</div>';
}
