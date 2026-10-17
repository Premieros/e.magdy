import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {__test as app} from '../app.js';
import {initializeFirstVisitDemo,DEFAULT_DEMO_ENABLED,DEMO_OPT_OUT_KEY,optedOutOfDemo,preferRealData} from '../src/demo-onboarding.mjs';
import {populateDemoData,demoCoverage} from '../src/demo-data.mjs';
import {validateCloudSnapshot} from '../src/cloud-backup.mjs';
import {STATION_STAGES} from '../src/smart-workflow.mjs';

const ops={
  newMaterial:app.newMaterial,newStyle:app.newStyle,receive:app.receive,
  setBom:app.setBom,newOrder:app.newOrder,advance:app.advance,quality:app.quality
};
const factory=()=>{const db=app.fresh();populateDemoData(db,ops);return db;};
function memory(){
  const data=new Map(),writes=[];
  return {
    writes,data,
    getItem:key=>data.has(key)?data.get(key):null,
    setItem:(key,value)=>{writes.push({key,value});data.set(key,value);}
  };
}
const key='premieros-garments-local-v1';
const init=storage=>initializeFirstVisitDemo({
  storage,key,createFresh:app.fresh,populate:db=>populateDemoData(db,ops)
});

test('new visitor automatically receives complete fictional demo data on first link open',()=>{
  const storage=memory();
  const db=init(storage);
  assert.equal(db.demoMode,true);
  assert.equal(storage.writes.length,1);
  assert.equal(storage.writes[0].key,key);
  const persisted=JSON.parse(storage.getItem(key));
  assert.equal(persisted.demoMode,true);
  assert.equal(validateCloudSnapshot(persisted).orders.length,db.orders.length);
  const coverage=demoCoverage(db);
  assert.ok(coverage.styles>=3);
  assert.ok(coverage.materials>=9);
  assert.ok(coverage.orders>=11);
  assert.ok(coverage.workers>=5);
  assert.ok(coverage.sales>=3);
  assert.ok(coverage.stock>0);
  for(const phase of STATION_STAGES)assert.ok(coverage.statuses[phase]>0,phase);
});

test('all new visitor browsers use the same sample products, amounts, production stages and clients',()=>{
  const a=init(memory()),b=init(memory());
  const products=db=>db.styles.map(s=>({name:s.name,sizes:s.sizes,colors:s.colors,sellingPrice:s.sellingPrice}));
  assert.deepEqual(products(a),products(b));
  assert.deepEqual(demoCoverage(a).statuses,demoCoverage(b).statuses);
  assert.deepEqual(a.materials.map(m=>[m.name,m.stock,m.avgCost]),
    b.materials.map(m=>[m.name,m.stock,m.avgCost]));
  assert.deepEqual(a.wholesaleOrders.map(o=>o.customer),b.wholesaleOrders.map(o=>o.customer));
  assert.equal(a.orders.length,b.orders.length);
});

test('reload does not duplicate samples or undo a visitor checklist or stock change',()=>{
  const storage=memory(),db=init(storage);
  db.orders[0].customer='Client changed locally';
  db.materials[0].stock=42;
  storage.setItem(key,JSON.stringify(db));
  const existing=storage.getItem(key),writes=storage.writes.length;
  assert.equal(init(storage),null);
  assert.equal(storage.getItem(key),existing);
  assert.equal(storage.writes.length,writes);
});

test('an older saved operational database is not replaced with the showcase',()=>{
  const storage=memory(),existing=app.fresh();
  existing.suppliers.push({id:'supplier-1',name:'Real data'});
  existing.financeEntries.push({id:'tx-1',amount:900});
  storage.setItem(key,JSON.stringify(existing));
  const old=storage.getItem(key);
  assert.equal(init(storage),null);
  assert.equal(storage.getItem(key),old);
});

test('deliberately reset empty databases and malformed saved snapshots never get overwritten',()=>{
  const storage=memory();
  storage.setItem(key,JSON.stringify(app.fresh()));
  assert.equal(init(storage),null);
  assert.equal(storage.writes.length,1);
  storage.setItem(key,'{malformed but potentially recoverable data');
  assert.equal(init(storage),null);
  assert.equal(storage.getItem(key),'{malformed but potentially recoverable data');
});

test('demo population failures do not leave partial data in local storage',()=>{
  const storage=memory();
  assert.throws(()=>initializeFirstVisitDemo({
    storage,key,createFresh:app.fresh,populate:db=>{db.styles.push({name:'partial'});throw Error('Not ready');}
  }),/Not ready/);
  assert.equal(storage.getItem(key),null);
  assert.equal(storage.writes.length,0);
});

test('page entrypoint includes auto-demo and GitHub Pages ships helper without cloud side effects',()=>{
  const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  const helper=readFileSync(new URL('../src/demo-onboarding.mjs',import.meta.url),'utf8');
  assert.match(src,/initializeFirstVisitDemo\(\{storage:localStorage,key:KEY,createFresh:fresh/);
  assert.match(src,/populate:d=>populateDemoData\(d,\{newMaterial,newStyle,receive,setBom,newOrder,advance,quality\}\)/);
  assert.match(workflow,/src\/demo-data\.mjs src\/demo-onboarding\.mjs src\/cloud-intake\.mjs site\/src/);
  assert.match(workflow,/test -s site\/src\/demo-onboarding\.mjs/);
  assert.doesNotMatch(helper,/fetch\(|cloudSave|cloudLogin|supabase/i);
});


test('temporary default demo stays enabled for new visitors and can be disabled centrally later',()=>{
  assert.equal(DEFAULT_DEMO_ENABLED,true);
  const storage=memory();
  const disabled=initializeFirstVisitDemo({
    storage,key,createFresh:app.fresh,enabled:false,
    populate:db=>populateDemoData(db,ops)
  });
  assert.equal(disabled,null);
  assert.equal(storage.getItem(key),null);
  assert.equal(storage.writes.length,0);
  const demo=init(storage);
  assert.equal(demo.demoMode,true);
});

test('choosing real work persists opt-out and never creates fake business records again',()=>{
  const storage=memory();
  const preview=init(storage);
  assert.equal(preview.demoMode,true);
  assert.equal(preferRealData(storage),true);
  assert.equal(storage.getItem(DEMO_OPT_OUT_KEY),'1');
  assert.equal(optedOutOfDemo(storage),true);
  // Clearing demo data leaves a safe, user-controlled blank dataset.
  storage.setItem(key,JSON.stringify(app.fresh()));
  const saved=storage.getItem(key);
  assert.equal(init(storage),null);
  assert.equal(storage.getItem(key),saved);
  // Even if the data key gets removed, the real-work preference is honored.
  storage.data.delete(key);
  assert.equal(init(storage),null);
  assert.equal(storage.getItem(key),null);
});

test('real mode switching is guarded and visible in both Arabic and English',()=>{
  const appSrc=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../src/i18n.mjs',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(appSrc,/else if\(a==='start-real'\)startRealWork\(\)/);
  assert.match(appSrc,/if\(!db\.demoMode\)/);
  assert.match(appSrc,/if\(syncWanted\)\{toast\('أوقف المزامنة أولًا قبل تغيير بيانات الجهاز'/);
  assert.match(appSrc,/preferRealData\(localStorage\)/);
  assert.match(appSrc,/mutator\(d=>\{Object\.assign\(d,fresh\(\)\);\},'بدأت نسخة عمل/);
  assert.match(appSrc,/DEFAULT_DEMO_ENABLED/);
  assert.match(appSrc,/wt-demo-default-banner/);
  assert.match(ui,/Start real work/);
  assert.match(css,/\.wt-demo-default-banner/);
});

test('opt-out cannot silently fail and then pretend the visitor chose real mode',()=>{
  assert.throws(()=>preferRealData({
    setItem(){throw Error('QuotaExceeded');}
  }),/QuotaExceeded/);
  assert.equal(optedOutOfDemo({getItem(){throw Error('blocked')}}),false);
});
