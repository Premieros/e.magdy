import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __test as g } from '../app.js';
import { validateCloudSnapshot } from '../src/cloud-backup.mjs';

const form=rows=>{const f=new FormData();for(const [key,value] of Object.entries(rows))f.set(key,String(value));return f;};
function setup(){
  const db=g.fresh();
  g.newMaterial(db,form({code:'F01',name:'قماش',unit:'متر'}));
  g.receive(db,form({materialId:db.materials[0].id,quantity:300,unitCost:25}));
  g.newStyle(db,form({code:'J01',name:'جاكيت',sizes:'M, L',colors:'أسود, أزرق',price:200}));
  g.setBom(db,db.styles[0].id,form({['bom_'+db.materials[0].id]:'2'}));
  return db;
}
function matrix(db,variants){
  const v=db.styles[0].variants;
  const entries={styleId:db.styles[0].id,customer:'عميل مصنع',due:'2026-12-15'};
  for(const [index,qty] of variants)entries['matrix_'+v[index].id]=qty;
  return form(entries);
}
test('one size/color matrix creates linked but separately tracked work orders',()=>{
  const db=setup();
  const result=g.createProductionMatrix(db,matrix(db,[[0,10],[3,5]]));
  assert.equal(result.total,15);
  assert.equal(result.orders.length,2);
  assert.equal(db.orders.length,2);
  assert.equal(db.orders[0].qty,10);
  assert.equal(db.orders[1].qty,5);
  assert.equal(db.orders[0].batchId,db.orders[1].batchId);
  assert.notEqual(db.orders[0].id,db.orders[1].id);
  assert.notEqual(db.orders[0].variantId,db.orders[1].variantId);
  assert.equal(db.orders[0].status,'planned');
  assert.equal(db.materials[0].stock,300);
  assert.equal(db.ledger.filter(x=>x.kind==='issue').length,0);
  const batches=g.productionBatches(db);
  assert.equal(batches.length,1);
  assert.equal(batches[0].qty,15);
  assert.equal(batches[0].orders.length,2);
  assert.equal(batches[0].completed,0);
});
test('matrix validates all quantity cells before creating any work order',()=>{
  const db=setup();
  assert.throws(()=>g.createProductionMatrix(db,matrix(db,[[0,7],[1,-1]])),/صحيح/);
  assert.equal(db.orders.length,0);
  assert.throws(()=>g.createProductionMatrix(db,matrix(db,[[0,0],[1,0]])),/كمية/);
  assert.equal(db.orders.length,0);
  assert.throws(()=>g.createProductionMatrix(db,matrix(db,[[0,60000],[1,60000]])),/100000/);
  assert.equal(db.orders.length,0);
  assert.throws(()=>g.createProductionMatrix(db,matrix(db,[[0,2.5]])),/صحيح/);
  assert.equal(db.orders.length,0);
});
test('matrix requires prepared BOM and correct existing style',()=>{
  const db=setup();
  db.styles[0].bom=[];
  assert.throws(()=>g.createProductionMatrix(db,matrix(db,[[0,5]])),/BOM/);
  assert.equal(db.orders.length,0);
  assert.throws(()=>g.createProductionMatrix(db,form({styleId:'unknown'})),/موديل/);
});
test('cutting bundles must balance before inventory is issued',()=>{
  const db=setup();
  const [order]=g.createProductionMatrix(db,matrix(db,[[0,10]])).orders;
  const start=db.materials[0].stock;
  g.addCuttingBundle(db,form({orderId:order.id,bundleNo:'B-01',quantity:6,notes:'رص قماش'}));
  assert.equal(g.cuttingBundleStats(db,order.id).total,6);
  assert.throws(()=>g.advance(db,order.id),/مطابقة إجمالي حزم القص/);
  assert.equal(order.status,'planned');
  assert.equal(db.materials[0].stock,start);
  assert.equal(db.ledger.filter(x=>x.kind==='issue').length,0);
  assert.throws(()=>g.addCuttingBundle(db,form({orderId:order.id,bundleNo:'B-01',quantity:1})),/مستخدم/);
  assert.throws(()=>g.addCuttingBundle(db,form({orderId:order.id,bundleNo:'B-02',quantity:5})),/يتجاوز/);
  g.addCuttingBundle(db,form({orderId:order.id,bundleNo:'B-02',quantity:4}));
  assert.equal(g.cuttingBundleStats(db,order.id).total,10);
  g.advance(db,order.id);
  assert.equal(order.status,'cutting');
  assert.equal(db.materials[0].stock,start-20);
  assert.equal(db.ledger.filter(x=>x.kind==='issue').length,1);
  assert.throws(()=>g.addCuttingBundle(db,form({orderId:order.id,bundleNo:'B-03',quantity:1})),/قبل بدء القص/);
  g.advance(db,order.id);
  assert.equal(db.materials[0].stock,start-20);
});
test('one matrix does not cause a second SKU to issue or finish early',()=>{
  const db=setup();
  const lot=g.createProductionMatrix(db,matrix(db,[[0,10],[2,5]]));
  const [first,second]=lot.orders;
  g.advance(db,first.id);
  assert.equal(db.materials[0].stock,280);
  assert.equal(second.status,'planned');
  assert.equal(g.cuttingBundleStats(db,second.id).total,0);
  while(first.status!=='quality')g.advance(db,first.id);
  g.quality(db,first.id,form({good:9,reject:1,labor:20,overhead:5}));
  g.advance(db,first.id);
  assert.equal(db.finished.length,0);
  while(first.status!=='completed')g.advance(db,first.id);
  assert.equal(g.productionBatches(db)[0].completed,1);
  assert.equal(db.finished.length,1);
  assert.equal(db.finished[0].variantId,first.variantId);
  assert.equal(second.good,0);
  assert.equal(second.materialCost,0);
});
test('old cloud snapshots receive empty bundle arrays without data loss',()=>{
  const db=setup();
  delete db.cuttingBundles;
  const parsed=validateCloudSnapshot(db);
  assert.deepEqual(parsed.cuttingBundles,[]);
  assert.equal(parsed.styles.length,1);
  assert.equal(parsed.materials[0].stock,300);
  assert.equal(Object.hasOwn(db,'cuttingBundles'),false);
  g.ensureFactoryState(db);
  assert.deepEqual(db.cuttingBundles,[]);
});
