import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dashboardAnalytics } from '../src/analytics.mjs';
import { __test as g } from '../app.js';

const localDay=new Date(2026,9,17,12);
const form=fields=>{
  const f=new FormData();
  for(const [k,v] of Object.entries(fields))f.set(k,String(v));
  return f;
};
test('empty dashboard is honest: zero counts, no invented trend or success percentages',()=>{
  const x=dashboardAnalytics(g.fresh(),localDay);
  assert.equal(x.totalOrders,0);
  assert.equal(x.activeOrders,0);
  assert.equal(x.qualityRate,null);
  assert.equal(x.completionRate,null);
  assert.equal(x.daily.length,7);
  assert.equal(x.dailyTotal,0);
  assert.equal(x.topModels.length,0);
  assert.ok(x.insights.some(v=>v.includes('تُسجَّل')));
});
test('completion, inspection and weekly pieces are calculated from actual order history',()=>{
  const db=g.fresh(),now=localDay.toISOString();
  db.styles.push({id:'style-1',name:'قميص رجالي',variants:[]});
  db.orders.push(
    {id:'a',status:'completed',styleId:'style-1',qty:10,good:9,reject:1,history:[{stage:'completed',at:now}]},
    {id:'b',status:'quality',styleId:'style-1',qty:5,good:4,reject:1,history:[]},
    {id:'c',status:'planned',styleId:'style-1',qty:7,good:0,reject:0,history:[]},
    {id:'d',status:'cancelled',styleId:'style-1',qty:50,good:0,reject:0,history:[]}
  );
  const x=dashboardAnalytics(db,localDay);
  assert.equal(x.totalOrders,3);
  assert.equal(x.activeOrders,2);
  assert.equal(x.completedOrders,1);
  assert.equal(x.completionRate,33.33);
  assert.equal(x.good,13);
  assert.equal(x.rejected,2);
  assert.equal(x.qualityRate,86.67);
  assert.equal(x.dailyTotal,9);
  assert.equal(x.daily.at(-1).completed,9);
  assert.equal(x.topModels[0].qty,22);
  assert.equal(x.stages.find(r=>r.label==='اكتمل الإنتاج').value,1);
});
test('daily output excludes undated history and production not yet packed',()=>{
  const db=g.fresh(),older=new Date(2026,9,5,12).toISOString();
  db.orders.push(
    {status:'completed',qty:20,good:18,reject:2,history:[{stage:'completed',at:older}]},
    {status:'completed',qty:9,good:8,reject:1,history:[]},
    {status:'packing',qty:10,good:10,reject:0,history:[]}
  );
  const x=dashboardAnalytics(db,localDay);
  assert.equal(x.dailyTotal,0);
  assert.equal(x.completedOrders,2);
  assert.equal(x.qualityRate,92.31);
});
test('stock, sales and alerts keep real units separate',()=>{
  const db=g.fresh();
  db.materials=[{id:'a',name:'قماش',unit:'متر',stock:20,avgCost:10},
    {id:'b',name:'أزرار',unit:'قطعة',stock:0,avgCost:3},
    {id:'c',name:'خيط',unit:'رول',stock:70,avgCost:5}];
  db.finished=[{variantId:'v1',qty:20}];
  db.finishedDispatches=[{lines:[{variantId:'v1',qty:8}]}];
  const x=dashboardAnalytics(db,localDay);
  assert.equal(x.lowCount,2);
  assert.equal(x.outOfStock,1);
  assert.equal(x.shipped,8);
  assert.equal(x.onHand,12);
  assert.ok(x.insights.some(z=>z.includes('نفد رصيدها')));
});
test('product, material, worker, roll and cutting bundle can get internal codes automatically',()=>{
  const db=g.fresh();
  g.newMaterial(db,form({name:'قماش قطن',unit:'متر'}));
  assert.match(db.materials[0].code,/^MAT-/);
  g.newStyle(db,form({name:'قميص',sizes:'M',colors:'أبيض',price:100}));
  assert.match(db.styles[0].code,/^MODEL-/);
  g.addWorker(db,form({name:'أحمد',role:'قص',rate:2}));
  assert.match(db.workers[0].code,/^EMP-/);
  g.receiveFabricRoll(db,form({materialId:db.materials[0].id,quantity:50,unitCost:10}));
  assert.match(db.fabricRolls[0].rollNo,/^ROLL-/);
  g.setBom(db,db.styles[0].id,form({['bom_'+db.materials[0].id]:1}));
  g.newOrder(db,form({styleId:db.styles[0].id,variantId:db.styles[0].variants[0].id,quantity:2}));
  g.addCuttingBundle(db,form({orderId:db.orders[0].id,quantity:2}));
  assert.match(db.cuttingBundles[0].bundleNo,/^BUNDLE-/);
  assert.equal(db.materials[0].stock,50);
});
test('charts are sourced from repository data and shipped on GitHub Pages',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(app,/dashboardAnalytics\(db\)/);
  assert.match(app,/dashboardBarGraph\(stats\)/);
  assert.match(app,/dashboardQualityChart\(stats\)/);
  assert.match(app,/dashboardWeekChart\(stats\)/);
  assert.match(app,/dashboardModelsChart\(stats\)/);
  assert.match(app,/نسبة اجتياز الجودة/);
  assert.match(css,/\.wt-analytics-grid/);
  assert.match(pages,/cp src\/workflow\.mjs src\/analytics\.mjs/);
});
