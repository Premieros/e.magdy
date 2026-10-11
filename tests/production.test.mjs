import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __test as g } from '../app.js';
const form = x => { const f = new FormData(); Object.entries(x).forEach(([k,v])=>f.set(k,String(v))); return f; };
function prepared(){
  const db=g.fresh();
  g.newMaterial(db,form({code:'FAB1',name:'قماش',category:'أقمشة',unit:'متر'}));
  g.receive(db,form({materialId:db.materials[0].id,quantity:100,unitCost:20,reference:'INV'}));
  g.newStyle(db,form({code:'SH10',name:'قميص',sizes:'M, L',colors:'أحمر, أزرق',price:400}));
  g.setBom(db,db.styles[0].id,form({['bom_'+db.materials[0].id]:'2'}));
  g.newOrder(db,form({styleId:db.styles[0].id,variantId:db.styles[0].variants[0].id,quantity:10,customer:'تجريبي'}));
  return db;
}
test('one SKU for each size and color',()=>{
  const db=prepared();
  assert.equal(db.styles[0].variants.length,4);
  assert.equal(new Set(db.styles[0].variants.map(x=>x.sku)).size,4);
});
test('cannot duplicate style code',()=>{
  const db=prepared();
  assert.throws(()=>g.newStyle(db,form({code:'SH10',name:'B',sizes:'M',colors:'أسود',price:1})),/موجود/);
});
test('weighted cost recalculates with new purchases',()=>{
  const db=prepared();
  g.receive(db,form({materialId:db.materials[0].id,quantity:100,unitCost:40}));
  assert.equal(db.materials[0].stock,200);
  assert.equal(db.materials[0].avgCost,30);
});
test('cannot start cutting with insufficient fabric',()=>{
  const db=prepared();
  db.orders[0].qty=1000;
  assert.throws(()=>g.advance(db,db.orders[0].id),/غير كاف/);
  assert.equal(db.materials[0].stock,100);
  assert.equal(db.ledger.filter(x=>x.kind==='issue').length,0);
});
test('cutting deducts BOM exactly once',()=>{
  const db=prepared(),oid=db.orders[0].id;
  g.advance(db,oid);
  assert.equal(db.materials[0].stock,80);
  assert.equal(db.orders[0].materialCost,400);
  g.advance(db,oid);
  assert.equal(db.materials[0].stock,80);
  assert.equal(db.ledger.filter(x=>x.kind==='issue').length,1);
});
test('QC requires balancing quantity, and finished receipt is not duplicated',()=>{
  const db=prepared(),o=db.orders[0];
  for(let i=0;i<4;i++)g.advance(db,o.id);
  assert.equal(o.status,'quality');
  assert.throws(()=>g.advance(db,o.id),/المقبول/);
  assert.throws(()=>g.quality(db,o.id,form({good:11,reject:0,labor:0,overhead:0})),/غير صالحة/);
  g.quality(db,o.id,form({good:9,reject:1,labor:90,overhead:45}));
  g.advance(db,o.id);
  assert.equal(o.status,'completed');
  assert.equal(db.finished[0].qty,9);
  assert.equal(db.finished[0].unitCost,59.44);
  assert.throws(()=>g.advance(db,o.id));
  assert.equal(db.finished.length,1);
});
