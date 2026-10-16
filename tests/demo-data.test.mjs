import { test } from 'node:test';
import { stages } from '../src/workflow.mjs';
import assert from 'node:assert/strict';
import { __test as g } from '../app.js';
import { populateDemoData, isDemoEligible, demoCoverage } from '../src/demo-data.mjs';
import { availableFinishedStock, wholesaleProgress, validateWholesaleLedger } from '../src/wholesale.mjs';
import { validateCloudSnapshot } from '../src/cloud-backup.mjs';
import { readFileSync } from 'node:fs';

const actions={
  newMaterial:g.newMaterial,newStyle:g.newStyle,receive:g.receive,setBom:g.setBom,
  newOrder:g.newOrder,advance:g.advance,quality:g.quality
};
const populate=()=>{const db=g.fresh();const coverage=populateDemoData(db,actions);return {db,coverage};};

test('sample loading is opt-in and rejects all non-empty operational databases',()=>{
  const db=g.fresh();
  assert.equal(isDemoEligible(db),true);
  db.audit.unshift({message:'موجود مسبقًا'});
  assert.equal(isDemoEligible(db),true); // An empty factory with audit history may not contain operational data.
  db.audit=[];
  db.styles.push({id:'existing'});
  assert.equal(isDemoEligible(db),false);
  assert.throws(()=>populateDemoData(db,actions),/فارغة/);
  assert.equal(db.styles.length,1);
  const {db:sample}=populate();
  assert.equal(isDemoEligible(sample),false);
  assert.throws(()=>populateDemoData(sample,actions),/فارغة/);
});

test('full demonstration populates styles, materials, rolls, workers, every production stage and sales',()=>{
  const {db,coverage}=populate();
  assert.equal(db.demoMode,true);
  assert.ok(db.demoInfo.name.includes('افتراضية'));
  assert.ok(coverage.styles>=3);
  assert.ok(coverage.sku>=15);
  assert.ok(coverage.materials>=9);
  assert.ok(coverage.rolls>=4);
  assert.ok(coverage.workers>=5);
  assert.ok(coverage.workLogs>=13);
  assert.ok(coverage.lots>=1);
  assert.ok(coverage.bundles>=2);
  assert.ok(coverage.finished>=3);
  assert.ok(coverage.sales>=3);
  assert.ok(coverage.dispatches>=2);
  assert.ok(coverage.audit>=25);
  assert.ok(coverage.stock>0);
  for(const stage of stages){
    assert.ok(coverage.statuses[stage]>0,'missing '+stage);
  }
  assert.ok(db.materials.some(m=>m.stock<25));
  assert.deepEqual(coverage,demoCoverage(db));
});

test('all sample raw and finished stock movements stay within valid balances',()=>{
  const {db}=populate();
  for(const material of db.materials){
    const ledgerBalance=db.ledger.filter(x=>x.materialId===material.id)
      .reduce((sum,x)=>sum+x.qty,0);
    assert.ok(Math.abs(material.stock-ledgerBalance)<0.00011,material.code+' '+material.stock+' vs '+ledgerBalance);
    assert.ok(material.stock>=0,material.code);
  }
  for(const roll of db.fabricRolls){
    assert.ok(roll.remaining>=0 && roll.remaining<=roll.received,roll.rollNo);
  }
  const variants=db.styles.flatMap(s=>s.variants);
  for(const variant of variants){
    assert.ok(availableFinishedStock(db,variant.id)>=0,variant.sku);
  }
  assert.equal(validateWholesaleLedger(db),db);
  assert.ok(db.finishedDispatches.every(d=>d.reference.startsWith('DEMO-DO-')));
});

test('sample includes separate partial, fulfilled and open wholesale requests',()=>{
  const {db}=populate();
  const statuses=db.wholesaleOrders.map(order=>wholesaleProgress(db,order).status);
  assert.ok(statuses.includes('partial'));
  assert.ok(statuses.includes('fulfilled'));
  assert.ok(statuses.includes('open'));
  for(const order of db.wholesaleOrders){
    const p=wholesaleProgress(db,order);
    assert.equal(p.ordered,p.shipped+p.remaining);
  }
});

test('sample production lots, bundles and line items match work orders',()=>{
  const {db}=populate();
  const orderIds=new Set(db.orders.map(o=>o.id));
  assert.equal(orderIds.size,db.orders.length);
  const batchIds=new Set(db.orders.filter(o=>o.batchId).map(o=>o.batchId));
  assert.ok(batchIds.size);
  assert.ok(db.cuttingBundles.every(bundle=>orderIds.has(bundle.orderId)));
  assert.ok(db.workLogs.every(log=>orderIds.has(log.orderId)));
  assert.ok(db.finished.every(receipt=>orderIds.has(receipt.orderId)));
  assert.ok(db.orders.filter(o=>o.status==='completed').every(o=>db.finished.some(x=>x.orderId===o.id)));
  for(const order of db.orders){
    const tracked=db.cuttingBundles.filter(x=>x.orderId===order.id);
    if(tracked.length)assert.equal(tracked.reduce((s,x)=>s+x.qty,0),order.qty);
  }
});

test('sample is explicitly labeled and can be exported as a local JSON backup',()=>{
  const {db}=populate();
  const backup=JSON.parse(JSON.stringify(db));
  const validated=validateCloudSnapshot(backup);
  assert.equal(validated.demoMode,true);
  assert.ok(validated.wholesaleOrders.length);
  assert.ok(validated.cuttingBundles.length);
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.match(app,/isDemoEligible\(db\)/);
  assert.match(app,/demo-banner/);
  assert.match(app,/db\.demoMode\)\{toast\('النسخ السحابي معطّل/);
  assert.match(app,/populat[e]DemoData/);
});
