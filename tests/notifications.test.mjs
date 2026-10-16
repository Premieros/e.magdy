import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __test as g } from '../app.js';
import { buildNotifications, newNotification, ensureNotifications,
  appendNotifications, unreadCount, NOTIFICATION_LIMIT } from '../src/notifications.mjs';
import { validateCloudSnapshot } from '../src/cloud-backup.mjs';

const form=fields=>{
  const f=new FormData();
  for(const [key,value] of Object.entries(fields))f.set(key,String(value));
  return f;
};
const prepared=()=>{
  const db=g.fresh();
  g.newMaterial(db,form({code:'COT',name:'قماش قطني',unit:'متر'}));
  g.receive(db,form({materialId:db.materials[0].id,quantity:30,unitCost:20}));
  g.newStyle(db,form({code:'WT100',name:'قميص',sizes:'M',colors:'أسود',price:400}));
  g.setBom(db,db.styles[0].id,form({['bom_'+db.materials[0].id]:2}));
  g.newOrder(db,form({styleId:db.styles[0].id,variantId:db.styles[0].variants[0].id,quantity:10}));
  return db;
};

test('legacy snapshots keep business data while gaining an optional notifications array',()=>{
  const old=prepared();
  delete old.notifications;
  ensureNotifications(old);
  assert.deepEqual(old.notifications,[]);
  const parsed=validateCloudSnapshot(old);
  assert.deepEqual(parsed.notifications,[]);
  assert.equal(parsed.orders.length,1);
  assert.equal(parsed.materials[0].stock,30);
  assert.throws(()=>ensureNotifications({notifications:{}}),/غير متوافق/);
});

test('stock debit, stage completion and low-stock warning are based on real deltas',()=>{
  const db=prepared(),before=structuredClone(db);
  g.advance(db,db.orders[0].id);
  assert.equal(db.materials[0].stock,10);
  const events=buildNotifications(before,db);
  assert.ok(events.some(e=>e.type==='stock'&&e.detail.includes('20 متر')));
  assert.ok(events.some(e=>e.type==='stage'&&e.title==='بدأ القص'));
  assert.ok(events.some(e=>e.type==='warning'&&e.title.includes('انخفاض المخزون')));
  assert.ok(events.every(e=>e.read===false && e.at && e.id));
  assert.equal(buildNotifications(db,structuredClone(db)).length,0);
});

test('each step transition shows the stage just finished',()=>{
  const db=prepared();
  g.advance(db,db.orders[0].id);
  const old=structuredClone(db);
  g.advance(db,db.orders[0].id);
  const events=buildNotifications(old,db);
  assert.ok(events.some(e=>e.title==='انتهت مرحلة القص'&&e.detail.includes('فرز بدائي')));
});

test('quality notifications report accepted and rejected counts',()=>{
  const db=prepared(),o=db.orders[0];
  while(o.status!=='quality')g.advance(db,o.id);
  const old=structuredClone(db);
  g.quality(db,o.id,form({good:8,reject:2,labor:20,overhead:0}));
  const events=buildNotifications(old,db);
  assert.ok(events.some(e=>e.type==='quality'&&e.detail.includes('مقبول 8 / مرفوض 2')));
  assert.equal(db.finished.length,0);
});

test('only packing generates finished goods receipt notification',()=>{
  const db=prepared(),o=db.orders[0];
  while(o.status!=='quality')g.advance(db,o.id);
  g.quality(db,o.id,form({good:9,reject:1,labor:10,overhead:0}));
  while(o.status!=='packing'){
    const before=structuredClone(db);
    g.advance(db,o.id);
    assert.equal(db.finished.length,0);
    assert.ok(!buildNotifications(before,db).some(e=>e.title.includes('ترحيل الإنتاج')));
  }
  const before=structuredClone(db);
  g.advance(db,o.id);
  const events=buildNotifications(before,db);
  assert.equal(db.finished.length,1);
  assert.ok(events.some(e=>e.type==='success'&&e.title.includes('ترحيل الإنتاج')&&e.detail.includes('9 قطعة')));
});

test('recording worker quantity and wholesale dispatch creates separate meaningful alerts',()=>{
  const db=prepared(),o=db.orders[0];
  g.addWorker(db,form({code:'EMP1',name:'عامل',role:'القص',rate:2}));
  g.advance(db,o.id);
  let before=structuredClone(db);
  g.registerStageWork(db,form({orderId:o.id,workerId:db.workers[0].id,quantity:10,batchRef:'B1'}));
  assert.ok(buildNotifications(before,db).some(e=>e.type==='worker'&&e.detail.includes('10 قطعة')));
  while(o.status!=='quality')g.advance(db,o.id);
  g.quality(db,o.id,form({good:10,reject:0,labor:0,overhead:0}));
  while(o.status!=='completed')g.advance(db,o.id);
  const s=db.styles[0],v=s.variants[0];
  before=structuredClone(db);
  g.createWholesaleOrder(db,form({styleId:s.id,customer:'العميل التجريبي',['sell_'+v.id]:5}));
  assert.ok(buildNotifications(before,db).some(e=>e.title.includes('طلب جملة جديد')));
  before=structuredClone(db);
  const sale=db.wholesaleOrders[0];
  g.dispatchWholesaleOrder(db,form({orderId:sale.id,reference:'DEL-WT-1',['ship_'+v.id]:5}));
  assert.ok(buildNotifications(before,db).some(e=>e.type==='delivery'&&e.detail.includes('5 قطعة')));
});

test('notifications are capped and read-only operations never mutate stock',()=>{
  const db=prepared();
  const originalStock=db.materials[0].stock;
  const events=Array.from({length:NOTIFICATION_LIMIT+20},(_,i)=>newNotification('info','حركة '+i));
  appendNotifications(db,events);
  assert.equal(db.notifications.length,NOTIFICATION_LIMIT);
  assert.equal(unreadCount(db),NOTIFICATION_LIMIT);
  db.notifications[0].read=true;
  assert.equal(unreadCount(db),NOTIFICATION_LIMIT-1);
  db.notifications.splice(0);
  assert.equal(unreadCount(db),0);
  assert.equal(db.materials[0].stock,originalStock);
});

test('existing Pages deployment packages notifications for every page and stays on existing Supabase',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const styles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  const client=readFileSync(new URL('../src/cloud-backup.mjs',import.meta.url),'utf8');
  assert.match(app,/notificationMarkup\(\)/);
  assert.match(app,/wt-toast-stack/);
  assert.match(app,/notifications-clear/);
  assert.match(app,/buildNotifications\(db,d\)/);
  assert.match(styles,/prefers-reduced-motion/);
  assert.match(styles,/\.wt-command-hero/);
  assert.match(pages,/cp src\/workflow\.mjs src\/notifications\.mjs/);
  assert.match(client,/yumeijsyiphzdsulsubf\.supabase\.co/);
});
