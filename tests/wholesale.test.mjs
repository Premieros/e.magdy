import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __test as g } from '../app.js';
import { validateCloudSnapshot } from '../src/cloud-backup.mjs';

const form=values=>{
  const data=new FormData();
  for(const [k,v] of Object.entries(values))data.set(k,String(v));
  return data;
};
function base(){
  const db=g.fresh();
  g.newMaterial(db,form({code:'MAT1',name:'قماش قطن',unit:'متر'}));
  g.receive(db,form({materialId:db.materials[0].id,quantity:500,unitCost:30}));
  g.newStyle(db,form({code:'T01',name:'تي شيرت',sizes:'M,L',colors:'أسود,أبيض',price:120}));
  g.setBom(db,db.styles[0].id,form({['bom_'+db.materials[0].id]:1}));
  return db;
}
function produce(db,index,qty){
  const s=db.styles[0],v=s.variants[index];
  g.newOrder(db,form({styleId:s.id,variantId:v.id,quantity:qty}));
  const order=db.orders[0];
  while(order.status!=='quality')g.advance(db,order.id);
  g.quality(db,order.id,form({good:qty,reject:0,labor:0,overhead:0}));
  while(order.status!=='completed')g.advance(db,order.id);
  return v.id;
}
function sale(db,counts){
  const s=db.styles[0];
  const row={styleId:s.id,customer:'شركة ملابس',due:'2026-12-01'};
  for(const [index,count] of counts)row['sell_'+s.variants[index].id]=count;
  return g.createWholesaleOrder(db,form(row));
}
function dispatch(db,order,counts,reference){
  const row={orderId:order.id,reference};
  const vs=db.styles[0].variants;
  for(const [index,count] of counts)row['ship_'+vs[index].id]=count;
  return g.dispatchWholesaleOrder(db,form(row));
}

test('legacy data and snapshots add wholesale arrays without losing factory data',()=>{
  const db=base();
  delete db.wholesaleOrders;delete db.finishedDispatches;
  g.ensureFactoryState(db);
  assert.deepEqual(db.wholesaleOrders,[]);
  assert.deepEqual(db.finishedDispatches,[]);
  assert.equal(db.styles.length,1);
  const snapshot=validateCloudSnapshot(db);
  assert.deepEqual(snapshot.wholesaleOrders,[]);
  assert.deepEqual(snapshot.finishedDispatches,[]);
  assert.equal(snapshot.styles.length,1);
});

test('creating wholesale order does not issue, reserve or change stock',()=>{
  const db=base();
  const id=produce(db,0,12);
  const initial=g.availableFinishedStock(db,id);
  const o=sale(db,[[0,8],[1,6]]);
  assert.equal(o.lines.length,2);
  assert.equal(g.wholesaleProgress(db,o).ordered,14);
  assert.equal(g.wholesaleProgress(db,o).status,'open');
  assert.equal(g.availableFinishedStock(db,id),initial);
  assert.equal(db.finishedDispatches.length,0);
  assert.equal(g.wholesaleProgress(db,o).amount,1680);
});

test('invalid order quantities cannot create partial wholesale orders',()=>{
  const db=base();
  const s=db.styles[0];
  assert.throws(()=>sale(db,[[0,0]]),/كمية/);
  assert.throws(()=>sale(db,[[0,3],[1,-2]]),/صحيح/);
  assert.throws(()=>sale(db,[[0,1.5]]),/صحيح/);
  assert.throws(()=>g.createWholesaleOrder(db,form({styleId:s.id,customer:''})),/اسم العميل/);
  assert.equal(db.wholesaleOrders.length,0);
});

test('dispatch may be partial and decrements available finished SKU exactly once',()=>{
  const db=base();
  const a=produce(db,0,10),b=produce(db,1,6);
  const o=sale(db,[[0,8],[1,5]]);
  dispatch(db,o,[[0,3],[1,4]],'DO-1');
  assert.equal(g.availableFinishedStock(db,a),7);
  assert.equal(g.availableFinishedStock(db,b),2);
  let p=g.wholesaleProgress(db,o);
  assert.equal(p.status,'partial');
  assert.equal(p.shipped,7);
  assert.equal(p.remaining,6);
  dispatch(db,o,[[0,5],[1,1]],'DO-2');
  p=g.wholesaleProgress(db,o);
  assert.equal(p.status,'fulfilled');
  assert.equal(p.shipped,13);
  assert.equal(p.remaining,0);
  assert.equal(g.availableFinishedStock(db,a),2);
  assert.equal(g.availableFinishedStock(db,b),1);
  assert.equal(g.wholesaleOverview(db).delivered,13);
  assert.equal(g.wholesaleOverview(db).value,1560);
  assert.equal(db.finished.length,2);
  assert.throws(()=>dispatch(db,o,[[0,1]],'DO-3'),/مكتمل/);
});

test('duplicate delivery number prevents shipping twice and cross-order duplication',()=>{
  const db=base();
  produce(db,0,10);
  const first=sale(db,[[0,3]]);
  dispatch(db,first,[[0,2]],'DO-100');
  const second=sale(db,[[0,2]]);
  assert.throws(()=>dispatch(db,second,[[0,1]],'DO-100'),/مستخدم/);
  assert.equal(db.finishedDispatches.length,1);
  assert.equal(g.wholesaleProgress(db,second).shipped,0);
  assert.equal(g.availableFinishedStock(db,db.styles[0].variants[0].id),8);
});

test('dispatch validation is atomic when another SKU is out of stock',()=>{
  const db=base();
  const a=produce(db,0,7),b=produce(db,1,2);
  const o=sale(db,[[0,5],[1,4]]);
  assert.throws(()=>dispatch(db,o,[[0,3],[1,3]],'DO-FAIL'),/غير كاف/);
  assert.equal(db.finishedDispatches.length,0);
  assert.equal(g.availableFinishedStock(db,a),7);
  assert.equal(g.availableFinishedStock(db,b),2);
  assert.equal(g.wholesaleProgress(db,o).shipped,0);
});

test('dispatch cannot ship more than remaining order even with enough stock',()=>{
  const db=base();
  const variantId=produce(db,0,20);
  const o=sale(db,[[0,3]]);
  assert.throws(()=>dispatch(db,o,[[0,4]],'DO-OVER'),/تتجاوز المتبقي/);
  assert.throws(()=>dispatch(db,o,[[0,0]],'DO-ZERO'),/قطعة واحدة/);
  assert.equal(g.availableFinishedStock(db,variantId),20);
  assert.equal(db.finishedDispatches.length,0);
});

test('multiple customers cannot oversell a common finished goods stock',()=>{
  const db=base();
  const variantId=produce(db,0,8);
  const a=sale(db,[[0,8]]),b=sale(db,[[0,8]]);
  dispatch(db,a,[[0,6]],'DO-A');
  assert.throws(()=>dispatch(db,b,[[0,3]],'DO-B'),/غير كاف/);
  dispatch(db,b,[[0,2]],'DO-B');
  assert.equal(g.availableFinishedStock(db,variantId),0);
  assert.equal(g.wholesaleProgress(db,a).remaining,2);
  assert.equal(g.wholesaleProgress(db,b).remaining,6);
});

test('prices are snapshotted when order is created',()=>{
  const db=base();
  produce(db,0,6);
  const order=sale(db,[[0,4]]);
  db.styles[0].sellingPrice=300;
  dispatch(db,order,[[0,4]],'DO-PRICE');
  assert.equal(order.lines[0].unitPrice,120);
  assert.equal(g.wholesaleProgress(db,order).amount,480);
  assert.equal(g.wholesaleOverview(db).value,480);
});


test('import validation catches impossible wholesale shipments and duplicate references',()=>{
  const db=base();
  produce(db,0,10);
  const o=sale(db,[[0,5]]);
  dispatch(db,o,[[0,4]],'DO-V1');
  assert.equal(g.validateWholesaleLedger(db),db);
  const tampered=structuredClone(db);
  tampered.finishedDispatches[0].lines[0].qty=11;
  assert.throws(()=>g.validateWholesaleLedger(tampered),/تجاوز|يتجاوز/);
  const copied=structuredClone(db);
  copied.finishedDispatches.push(structuredClone(copied.finishedDispatches[0]));
  assert.throws(()=>g.validateWholesaleLedger(copied),/مكرر/);
});
test('import validation rejects deliveries without matching sales or completed goods',()=>{
  const db=base();
  produce(db,0,4);
  const o=sale(db,[[0,4]]);
  dispatch(db,o,[[0,3]],'DO-V2');
  const noSale=structuredClone(db);
  noSale.wholesaleOrders=[];
  assert.throws(()=>g.validateWholesaleLedger(noSale),/دون طلب/);
  const noStock=structuredClone(db);
  noStock.finished=[];
  assert.throws(()=>g.validateWholesaleLedger(noStock),/مخزون/);
});
