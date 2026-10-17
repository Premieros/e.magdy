/* White tex role/user configuration (pre-login only).
 * IMPORTANT: This stores a draft permission matrix. It does NOT authenticate
 * anybody or authorize requests. Never gate UI or backend using this alone.
 */
const id=()=>globalThis.crypto?.randomUUID?.()??'U-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const str=x=>String(x??'').trim();
const now=()=>new Date().toISOString();
export const PERMISSION_GROUPS=Object.freeze([
  {name:'لوحة التحكم والتقارير',items:[['dashboard.view','عرض لوحة التحكم'],['reports.view','عرض التقارير']]},
  {name:'الإنتاج',items:[['products.manage','إدارة الموديلات والخامات المستخدمة'],['production.view','عرض أوامر الإنتاج'],['production.manage','إنشاء أوامر الإنتاج ونقل المراحل'],['workers.manage','إدارة العمال وتسجيل الإنتاج']]},
  {name:'المخزون والجودة',items:[['inventory.view','عرض المخزون'],['inventory.manage','استلام وصرف الخامات'],['suppliers.view','عرض الموردين'],['suppliers.manage','إدارة الموردين والتوريدات'],['quality.manage','تسجيل نتائج الجودة']]},
  {name:'المبيعات والعملاء',items:[['sales.view','عرض طلبات الجملة'],['sales.manage','إنشاء طلبات الجملة والتسليم'],['customers.view','عرض طلبات العملاء'],['customers.manage','إضافة طلبات العملاء']]},
  {name:'الحسابات والإدارة',items:[['accounting.view','عرض الحسابات'],['accounting.manage','إضافة حركات مالية'],['users.manage','إدارة المستخدمين والأدوار'],['backup.manage','إدارة النسخ الاحتياطية']]}
]);
export const PERMISSIONS=Object.freeze(PERMISSION_GROUPS.flatMap(group=>group.items.map(([key,label])=>({key,label,group:group.name}))));
const known=new Set(PERMISSIONS.map(p=>p.key));
const pkeys=()=>PERMISSIONS.map(p=>p.key);
const merge=(...arrays)=>[...new Set(arrays.flat())];
export const DEFAULT_ROLES=Object.freeze([
  {id:'owner',name:'مالك النظام',description:'كامل صلاحيات النظام عند تفعيل تسجيل الدخول',permissions:pkeys(),locked:true},
  {id:'manager',name:'مدير',description:'متابعة وإدارة التشغيل والمبيعات والتقارير',permissions:pkeys().filter(p=>!['users.manage','backup.manage'].includes(p)),locked:false},
  {id:'production',name:'مسؤول إنتاج',description:'الطلبات والمراحل والعاملون',permissions:merge(['dashboard.view','reports.view','products.manage','production.view','production.manage','workers.manage','inventory.view','quality.manage']),locked:false},
  {id:'warehouse',name:'مسؤول مخزن',description:'الخامات والأرصدة وحركة المخزون',permissions:['dashboard.view','inventory.view','inventory.manage','suppliers.view','suppliers.manage','production.view','reports.view'],locked:false},
  {id:'quality',name:'مسؤول جودة',description:'مراجعة الأوامر وتسجيل نتائج الجودة',permissions:['dashboard.view','production.view','quality.manage','reports.view'],locked:false},
  {id:'sales',name:'مسؤول مبيعات',description:'طلبات الجملة والتسليم والعملاء',permissions:['dashboard.view','sales.view','sales.manage','customers.view','customers.manage'],locked:false},
  {id:'accountant',name:'محاسب',description:'المبيعات والحسابات والتقارير',permissions:['dashboard.view','reports.view','accounting.view','accounting.manage','suppliers.view','sales.view'],locked:false},
  {id:'viewer',name:'مشاهد فقط',description:'عرض المعلومات دون تعديلها',permissions:['dashboard.view','reports.view','production.view','inventory.view','sales.view'],locked:false}
]);
const cloneRoles=()=>DEFAULT_ROLES.map(r=>({...r,permissions:[...r.permissions]}));
export function ensureAccessConfig(db){
  if(db.appRoles===undefined)db.appRoles=cloneRoles();
  if(db.appUsers===undefined)db.appUsers=[];
  if(!Array.isArray(db.appRoles)||!Array.isArray(db.appUsers))throw Error('بيانات المستخدمين والأدوار غير متوافقة');
  // Upgrade legacy owners when new permission categories are added without editing custom roles.
  const owner=db.appRoles.find(r=>r?.id==='owner');
  if(owner&&owner.locked&&Array.isArray(owner.permissions)){
    for(const key of pkeys())if(!owner.permissions.includes(key))owner.permissions.push(key);
  }
  return db;
}
export function validateAccessConfig(db){
  ensureAccessConfig(db);
  if(db.appRoles.length>120||db.appUsers.length>2000)throw Error('تم تجاوز الحد المسموح لإدارة المستخدمين');
  const roleIds=new Set(),roleNames=new Set(),users=new Set(),emails=new Set();
  for(const role of db.appRoles){
    if(!role||typeof role!=='object'||typeof role.id!=='string'||!role.id||
      typeof role.name!=='string'||!role.name.trim()||role.name.length>70||
      typeof role.description!=='string'||role.description.length>180||
      !Array.isArray(role.permissions)||typeof role.locked!=='boolean'||
      roleIds.has(role.id)||roleNames.has(role.name.trim().toLowerCase())||
      role.permissions.some(p=>!known.has(p))||new Set(role.permissions).size!==role.permissions.length)
      throw Error('تعريف دور أو صلاحيات غير صالح');
    if(role.id==='owner'&&(!role.locked||role.permissions.length!==known.size||
      pkeys().some(p=>!role.permissions.includes(p))))throw Error('لا يمكن تغيير صلاحيات مالك النظام');
    if(role.id!=='owner'&&role.locked)throw Error('الدور المحمي الوحيد هو المالك');
    roleIds.add(role.id);roleNames.add(role.name.trim().toLowerCase());
  }
  if(!roleIds.has('owner'))throw Error('دور مالك النظام مطلوب');
  let activeOwners=0;
  for(const user of db.appUsers){
    if(!user||typeof user!=='object'||typeof user.id!=='string'||!user.id||users.has(user.id)||
      typeof user.name!=='string'||!user.name.trim()||user.name.length>100||
      typeof user.email!=='string'||user.email.length>160||
      (user.email!==''&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email))||
      typeof user.roleId!=='string'||!roleIds.has(user.roleId)||
      typeof user.active!=='boolean'||typeof user.createdAt!=='string'||
      user.email!==''&&emails.has(user.email.toLowerCase()))
      throw Error('بيانات مستخدم غير صحيحة أو مكررة');
    users.add(user.id);
    if(user.email)emails.add(user.email.toLowerCase());
    if(user.active&&user.roleId==='owner')activeOwners++;
  }
  if(db.appUsers.length>0&&activeOwners<1)throw Error('يلزم وجود مالك نشط واحد على الأقل');
  return db;
}
const requireText=(x,label,length)=>{const val=str(x);if(!val||val.length>length)throw Error(label+' مطلوب (حتى '+length+' حرف)');return val;};
function note(db,textValue){if(Array.isArray(db.audit))db.audit.unshift({id:id(),at:now(),message:textValue});}
export function saveUser(db,form,originalId=''){
  ensureAccessConfig(db);
  const name=requireText(form.get('name'),'الاسم',100);
  const email=str(form.get('email')).toLowerCase();
  if(email&&(email.length>160||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw Error('البريد الإلكتروني غير صالح');
  const roleId=str(form.get('roleId'));
  if(!db.appRoles.some(r=>r.id===roleId))throw Error('اختر دورًا موجودًا');
  if(db.appUsers.some(u=>u.id!==originalId&&email&&u.email.toLowerCase()===email))throw Error('هذا البريد مستخدم بالفعل');
  const original=originalId?db.appUsers.find(u=>u.id===originalId):null;
  if(originalId&&!original)throw Error('المستخدم غير موجود');
  if(!original&&db.appUsers.length===0&&roleId!=='owner')throw Error('أضف مالك النظام أولًا');
  if(original?.active&&original.roleId==='owner'&&roleId!=='owner'&&
    db.appUsers.filter(u=>u.active&&u.roleId==='owner').length<=1)
    throw Error('لا يمكن تغيير دور آخر مالك نشط');
  if(original){Object.assign(original,{name,email,roleId,updatedAt:now()});}
  else db.appUsers.unshift({id:id(),name,email,roleId,active:true,createdAt:now()});
  validateAccessConfig(db);
  note(db,(original?'تعديل مستخدم: ':'إضافة مستخدم: ')+name);
}
export function toggleUser(db,userId){
  ensureAccessConfig(db);
  const user=db.appUsers.find(u=>u.id===userId);
  if(!user)throw Error('المستخدم غير موجود');
  if(user.active&&user.roleId==='owner'&&
    db.appUsers.filter(u=>u.active&&u.roleId==='owner').length<=1)
    throw Error('لا يمكن إيقاف آخر مالك نشط');
  user.active=!user.active;
  validateAccessConfig(db);
  note(db,(user.active?'تفعيل ':'إيقاف ')+user.name);
}
export function saveRole(db,form,originalId=''){
  ensureAccessConfig(db);
  const role=originalId?db.appRoles.find(r=>r.id===originalId):null;
  if(originalId&&!role)throw Error('الدور غير موجود');
  if(role?.locked)throw Error('صلاحيات مالك النظام ثابتة');
  const name=requireText(form.get('name'),'اسم الدور',70);
  const description=str(form.get('description'));
  if(description.length>180)throw Error('الوصف طويل جدًا');
  if(db.appRoles.some(r=>r.id!==originalId&&r.name.trim().toLowerCase()===name.toLowerCase()))throw Error('اسم الدور مستخدم');
  const permissions=[...new Set(form.getAll('permission').map(str).filter(Boolean))];
  if(permissions.some(p=>!known.has(p)))throw Error('الصلاحية المختارة غير معروفة');
  if(!permissions.length)throw Error('حدد صلاحية واحدة على الأقل');
  if(role)Object.assign(role,{name,description,permissions});
  else db.appRoles.push({id:id(),name,description,permissions,locked:false});
  validateAccessConfig(db);
  note(db,(role?'تعديل صلاحيات دور: ':'إضافة دور: ')+name);
}
export function removeRole(db,roleId){
  ensureAccessConfig(db);
  const role=db.appRoles.find(r=>r.id===roleId);
  if(!role)throw Error('الدور غير موجود');
  if(DEFAULT_ROLES.some(r=>r.id===roleId)||role.locked)throw Error('الأدوار الأساسية لا تُحذف؛ يمكنك تعديل صلاحياتها');
  if(db.appUsers.some(u=>u.roleId===roleId))throw Error('انقل المستخدمين إلى دور آخر قبل حذفه');
  db.appRoles=db.appRoles.filter(r=>r.id!==roleId);
  validateAccessConfig(db);
  note(db,'حذف دور مخصص: '+role.name);
}
export function permissionPreview(db,roleId){
  ensureAccessConfig(db);
  return (db.appRoles.find(r=>r.id===roleId)?.permissions||[]).map(key=>
    PERMISSIONS.find(p=>p.key===key)?.label).filter(Boolean);
}
// Not exposed as a security checker. No login, no authenticated identity and
// no server-side RLS enforcement for this local prototype.
export const ACCESS_ENFORCED=false;
