import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {__test as g} from '../app.js';
import {validateCloudSnapshot} from '../src/cloud-backup.mjs';
import {buildNotifications} from '../src/notifications.mjs';
import {recordFinanceEntry,accountingSummary} from '../src/accounting.mjs';
import {
 ensureSupplierState,validateSupplierState,saveSupplier,toggleSupplier,
 suppliersSummary,chooseSupplier
} from '../src/suppliers.mjs';
import {supplierPage,supplierForm,supplierPicker} from '../src/suppliers-ui.mjs';
import {hasBusinessData} from '../src/cloud-sync.mjs';

const form=x=>{const f=new FormData();for(const [k,v] of Object.entries(x))f.set(k,String(v));return f;};
const tx=(amount,id)=>form({kind:'supplier-payment',date:'2026-10-17',amount,supplierId:id,customer:'',note:'',category:''});
const newSupplier=db=>saveSupplier(db,form({name:'شركة القطن',phone:'01012345678',contact:'أحمد',address:'الإسكندرية',category:'أقمشة',notes:'توريد أسبوعي'}));
const ctx={esc:x=>String(x),heading:(a,b,c)=>a+b+c,btn:(a)=>a,metric:(a,b)=>a+b,
  table:(headers,body)=>headers.join(' | ')+body,td:x=>x,empty:(a,b)=>a+b,cur:x=>x+' ج.م',num:x=>String(x)};

test('supplier directory starts empty and old snapshots retain all production data',()=>{
 const db=g.fresh();delete db.suppliers;
 ensureSupplierState(db);
 assert.deepEqual(db.suppliers,[]);
 g.newMaterial(db,form({name:'قماش',unit:'متر'}));
 const local=structuredClone(db);delete local.suppliers;
 const restored=validateCloudSnapshot(local);
 assert.deepEqual(restored.suppliers,[]);
 assert.equal(restored.materials.length,1);
 assert.equal(Object.hasOwn(local,'suppliers'),false);
 assert.equal(hasBusinessData(db),true);
 const supplierOnly=g.fresh();newSupplier(supplierOnly);
 assert.equal(hasBusinessData(supplierOnly),true);
});

test('supplier registration, edit, duplicate detection and deactivation preserve identity',()=>{
 const db=g.fresh();
 const added=newSupplier(db);
 assert.equal(db.suppliers.length,1);
 assert.equal(added.name,'شركة القطن');
 assert.equal(added.active,true);
 assert.throws(()=>newSupplier(db),/موجود/);
 saveSupplier(db,form({name:'شركة القطن الجديدة',phone:'01012345678',category:'أقمشة',contact:'أحمد',address:'طنطا',notes:''}),added.id);
 assert.equal(added.name,'شركة القطن الجديدة');
 toggleSupplier(db,added.id);
 assert.equal(added.active,false);
 assert.throws(()=>chooseSupplier(db,added.id),/نشط/);
 toggleSupplier(db,added.id);
 assert.equal(chooseSupplier(db,added.id).id,added.id);
 validateSupplierState(db);
});
test('supplier receipt updates stock once and correctly tracks purchase value',()=>{
 const db=g.fresh(),supplier=newSupplier(db);
 g.newMaterial(db,form({name:'قماش',unit:'متر'}));
 g.receive(db,form({materialId:db.materials[0].id,quantity:20,unitCost:30,supplierId:supplier.id}));
 assert.equal(db.materials[0].stock,20);
 assert.equal(db.ledger.length,1);
 assert.equal(db.ledger[0].supplierId,supplier.id);
 assert.equal(suppliersSummary(db).purchases,600);
 assert.equal(suppliersSummary(db).payable,600);
 const ev=buildNotifications({...db,ledger:[]},db);
 assert.ok(ev.some(x=>x.detail.includes('شركة القطن')));
});
test('fabric roll receipt uses one ledger entry and its supplier is stored on roll',()=>{
 const db=g.fresh(),supplier=newSupplier(db);
 g.newMaterial(db,form({name:'قماش',unit:'متر'}));
 g.receiveFabricRoll(db,form({materialId:db.materials[0].id,quantity:14,unitCost:50,shade:'كحلي',supplierId:supplier.id}));
 assert.equal(db.fabricRolls[0].supplierId,supplier.id);
 assert.equal(db.ledger.length,1);
 assert.equal(db.ledger[0].supplierId,supplier.id);
 assert.equal(suppliersSummary(db).purchases,700);
 assert.equal(db.materials[0].stock,14);
});
test('supplier payment reduces payable and cash, never profit a second time',()=>{
 const db=g.fresh(),supplier=newSupplier(db);
 g.newMaterial(db,form({name:'قماش',unit:'متر'}));
 g.receive(db,form({materialId:db.materials[0].id,quantity:10,unitCost:20,supplierId:supplier.id}));
 recordFinanceEntry(db,tx(80,supplier.id));
 const summary=suppliersSummary(db),finance=accountingSummary(db);
 assert.equal(summary.purchases,200);
 assert.equal(summary.payments,80);
 assert.equal(summary.payable,120);
 assert.equal(summary.entries[0].balance,120);
 assert.equal(finance.supplierPayments,80);
 assert.equal(finance.cashMovement,-80);
 assert.equal(finance.netProfit,0);
 assert.equal(db.financeEntries[0].supplierId,supplier.id);
});
test('unlinked legacy deliveries and payments remain separate and do not inflate debts',()=>{
 const db=g.fresh(),supplier=newSupplier(db);
 g.newMaterial(db,form({name:'قماش',unit:'متر'}));
 g.receive(db,form({materialId:db.materials[0].id,quantity:10,unitCost:20}));
 recordFinanceEntry(db,tx(40,''));
 const summary=suppliersSummary(db);
 assert.equal(summary.purchases,0);
 assert.equal(summary.payments,0);
 assert.equal(summary.unassignedReceipts,1);
 assert.equal(summary.unassignedPayments,1);
 assert.equal(summary.payable,0);
 assert.equal(summary.entries[0].id,supplier.id);
});
test('amounts paid in advance are shown as advance, not an amount owed',()=>{
 const db=g.fresh(),supplier=newSupplier(db);
 recordFinanceEntry(db,tx(120,supplier.id));
 const summary=suppliersSummary(db);
 assert.equal(summary.payable,0);
 assert.equal(summary.advancePayments,120);
 assert.equal(summary.entries[0].balance,-120);
});
test('malformed suppliers and broken ledger or finance associations are rejected on import',()=>{
 const db=g.fresh(),supplier=newSupplier(db);
 const duplicate=structuredClone(db);duplicate.suppliers.push({...duplicate.suppliers[0],id:'dup'});
 assert.throws(()=>validateCloudSnapshot(duplicate),/مورد/);
 const bad=structuredClone(db);
 bad.ledger.push({id:'x',kind:'receive',materialId:'material',supplierId:'unknown',qty:3,cost:10,at:'2026-10-17'});
 assert.throws(()=>validateCloudSnapshot(bad),/مورد/);
 const invalid=structuredClone(db);
 invalid.financeEntries.push({id:'x',kind:'supplier-payment',amount:10,date:'2026-10-17',supplierId:'unknown',note:'',category:'',customer:'',createdAt:'2026-10-17T10:00:00.000Z'});
 assert.throws(()=>validateCloudSnapshot(invalid),/مورد/);
 assert.equal(supplier.id,db.suppliers[0].id);
});
test('supplier forms, directory, account screen and GitHub Pages deployment are wired',()=>{
 const db=g.fresh(),supplier=newSupplier(db);
 const html=supplierPage(db,ctx);
 const formHtml=supplierForm(db,ctx.esc,supplier.id);
 assert.match(html,/الموردون/);
 assert.match(html,/شركة القطن/);
 assert.match(html,/آخر معاملات الموردين/);
 assert.match(formHtml,/name="phone"/);
 assert.match(formHtml,/name="category"/);
 assert.match(supplierPicker(db,ctx.esc),/name="supplierId"/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
 const cloud=readFileSync(new URL('../src/cloud-backup.mjs',import.meta.url),'utf8');
 assert.match(app,/suppliers:suppliersPage/);
 assert.match(app,/new-supplier/);
 assert.match(app,/recordFinanceEntry\(d,f/);
 assert.match(app,/supplierPicker\(db,esc\)/);
 assert.match(cloud,/suppliers/);
 assert.match(pages,/src\/suppliers\.mjs src\/suppliers-ui\.mjs/);
});
