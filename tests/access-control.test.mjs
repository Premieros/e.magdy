import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __test as api } from '../app.js';
import { validateCloudSnapshot } from '../src/cloud-backup.mjs';
import {
  PERMISSIONS, DEFAULT_ROLES, ACCESS_ENFORCED, ensureAccessConfig,validateAccessConfig,
  saveUser,toggleUser,saveRole,removeRole,permissionPreview
} from '../src/access-control.mjs';
import { accessPage,accessUserForm,accessRoleForm } from '../src/access-ui.mjs';

const form=values=>{
  const obj=new FormData();
  for(const [key,value] of Object.entries(values)){
    if(Array.isArray(value))for(const entry of value)obj.append(key,entry);
    else obj.set(key,String(value));
  }
  return obj;
};
test('older datasets and snapshots gain default roles and users without losing production or accounting',()=>{
  const db=api.fresh();
  db.styles.push({id:'existing',name:'قطعة موجودة'});
  db.financeEntries.push({id:'legacy',kind:'owner-capital',amount:100,date:'2026-10-17',note:'',customer:'',category:'',createdAt:'2026-10-17T00:00:00.000Z'});
  delete db.appUsers;delete db.appRoles;
  ensureAccessConfig(db);
  assert.equal(db.appUsers.length,0);
  assert.ok(db.appRoles.some(r=>r.id==='owner'));
  const data=validateCloudSnapshot(db);
  assert.equal(data.styles[0].name,'قطعة موجودة');
  assert.equal(data.financeEntries.length,1);
  assert.deepEqual(data.appUsers,[]);
  assert.ok(data.appRoles.length>=8);
});
test('default role catalog has a protected owner and separate narrow permissions',()=>{
  assert.equal(ACCESS_ENFORCED,false);
  const db=api.fresh();
  const owner=db.appRoles.find(r=>r.id==='owner');
  assert.equal(owner.permissions.length,PERMISSIONS.length);
  assert.ok(owner.locked);
  const viewer=db.appRoles.find(r=>r.id==='viewer');
  assert.ok(viewer.permissions.includes('dashboard.view'));
  assert.ok(!viewer.permissions.includes('users.manage'));
  assert.ok(!viewer.permissions.includes('accounting.manage'));
  assert.ok(permissionPreview(db,'quality').some(x=>x.includes('الجودة')));
});
test('first user must be owner; user can be added without a password or forced login',()=>{
  const db=api.fresh();
  assert.throws(()=>saveUser(db,form({name:'مدير',roleId:'manager'})),/مالك/);
  saveUser(db,form({name:'مالك الشركة',roleId:'owner',email:'owner@whitetex.example'}));
  assert.equal(db.appUsers.length,1);
  assert.equal(db.appUsers[0].active,true);
  assert.equal(db.appUsers[0].roleId,'owner');
  assert.ok(!Object.hasOwn(db.appUsers[0],'password'));
  saveUser(db,form({name:'سارة',email:'quality@whitetex.example',roleId:'quality'}));
  assert.equal(db.appUsers.length,2);
  assert.throws(()=>saveUser(db,form({name:'مكرر',email:'QUALITY@WHITETEX.EXAMPLE',roleId:'quality'})),/البريد/);
  assert.equal(db.appUsers.length,2);
  validateAccessConfig(db);
});
test('editing existing staff and deactivation never removes the last active owner',()=>{
  const db=api.fresh();
  saveUser(db,form({name:'مالك',roleId:'owner'}));
  const original=db.appUsers[0];
  assert.throws(()=>toggleUser(db,original.id),/آخر مالك/);
  assert.throws(()=>saveUser(db,form({name:'مالك',roleId:'viewer'}),original.id),/آخر مالك/);
  saveUser(db,form({name:'مساعد',roleId:'owner'}));
  toggleUser(db,original.id);
  assert.equal(original.active,false);
  assert.throws(()=>toggleUser(db,db.appUsers[0].id),/آخر مالك/);
  toggleUser(db,original.id);
  saveUser(db,form({name:'مالك أول',roleId:'viewer'}),original.id);
  assert.equal(original.roleId,'viewer');
  assert.equal(original.name,'مالك أول');
  validateAccessConfig(db);
});
test('custom roles may be configured, edited and removed only when unassigned',()=>{
  const db=api.fresh();
  saveUser(db,form({name:'المالك',roleId:'owner'}));
  saveRole(db,form({name:'مشرف طباعة',description:'مراحل الطباعة',permission:['dashboard.view','production.view']}));
  const role=db.appRoles.at(-1);
  assert.deepEqual(role.permissions,['dashboard.view','production.view']);
  saveUser(db,form({name:'مشرف',roleId:role.id}));
  assert.throws(()=>removeRole(db,role.id),/انقل المستخدمين/);
  saveRole(db,form({name:'مشرف طباعة ومخازن',description:'إنتاج ومخزن',permission:['inventory.view','production.view']}),role.id);
  assert.deepEqual(role.permissions,['inventory.view','production.view']);
  const assigned=db.appUsers.find(u=>u.roleId===role.id);
  saveUser(db,form({name:assigned.name,roleId:'production'}),assigned.id);
  removeRole(db,role.id);
  assert.equal(db.appRoles.some(r=>r.id===role.id),false);
  assert.throws(()=>removeRole(db,'owner'),/أساسية/);
  validateAccessConfig(db);
});
test('invalid or duplicate rights, owner mutation and damaged snapshots are rejected',()=>{
  const db=api.fresh();
  const owner=db.appRoles.find(x=>x.id==='owner');
  assert.throws(()=>saveRole(db,form({name:'المالك',permission:['dashboard.view']}),'owner'),/مالك/);
  assert.throws(()=>saveRole(db,form({name:'غريب',permission:['hack.server']})),/معروفة/);
  assert.throws(()=>saveRole(db,form({name:'غريب',permission:[]})),/صلاحية/);
  assert.equal(owner.permissions.length,PERMISSIONS.length);
  const changed=structuredClone(db);changed.appRoles[0].permissions=['dashboard.view'];
  assert.throws(()=>validateCloudSnapshot(changed),/مالك النظام/);
  const noOwners=structuredClone(db);noOwners.appRoles=[];
  assert.throws(()=>validateAccessConfig(noOwners),/مالك|تعريف دور/);
});
test('UI exposes roster and permission editing while leaving app open',()=>{
  const db=api.fresh();
  const ctx={heading:(a,b)=>a+b,btn:(a,b,id)=>'<button>'+a+'</button>',esc:x=>String(x),
    table:(headers,rows)=>headers.join(',')+rows,td:x=>x,empty:(a,b)=>a+b};
  const html=accessPage(db,ctx);
  assert.match(html,/المستخدمون والصلاحيات/);
  assert.match(html,/الموقع مفتوح للجميع حاليًا/);
  assert.match(html,/الأدوار ومسؤولياتها/);
  assert.match(html,/إضافة مستخدم/);
  assert.doesNotMatch(html,/<form[^>]*action=["']\/login/);
  assert.match(accessUserForm(db,ctx.esc),/name="roleId"/);
  assert.doesNotMatch(accessUserForm(db,ctx.esc),/type="password"/);
  const r=accessRoleForm(db,ctx.esc);
  assert.match(r,/name="permission"/);
  assert.match(r,/المبيعات والعملاء/);
});
test('GitHub Pages packages access modules; production app is not login-gated',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  const back=readFileSync(new URL('../src/cloud-backup.mjs',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(app,/users:usersPage/);
  assert.match(app,/access-new-user/);
  assert.match(app,/access-new-role/);
  assert.match(app,/render\(\);\s*\}/);
  assert.match(pages,/src\/access-control\.mjs src\/access-ui\.mjs/);
  assert.match(back,/yumeijsyiphzdsulsubf\.supabase\.co/);
  assert.match(back,/validateAccessConfig\(parsed\)/);
  assert.match(css,/\.access-unlocked/);
});
