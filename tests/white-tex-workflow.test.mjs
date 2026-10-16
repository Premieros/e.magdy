import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __test as g } from '../app.js';
import { stages, labels, nextStageAction, stageTargetQuantity } from '../src/workflow.mjs';

const form = rows => {
  const f = new FormData();
  for (const [key, value] of Object.entries(rows)) f.set(key, String(value));
  return f;
};
function prepared() {
  const db = g.fresh();
  g.newMaterial(db, form({ code:'WT-FAB', name:'قماش', unit:'متر' }));
  g.receive(db, form({ materialId:db.materials[0].id, quantity:100, unitCost:20 }));
  g.newStyle(db, form({ code:'WT-01', name:'منتج White tex', sizes:'M', colors:'أبيض', price:100 }));
  g.setBom(db, db.styles[0].id, form({ ['bom_'+db.materials[0].id]:2 }));
  g.newOrder(db, form({ styleId:db.styles[0].id, variantId:db.styles[0].variants[0].id, quantity:10 }));
  return db;
}
test('White tex stage order is complete with stable old states', () => {
  assert.deepEqual(stages, [
    'planned','cutting','initial_sorting','production_line','sewing','finishing',
    'quality','printing','ironing','presentation_quality','packing','completed'
  ]);
  assert.equal(labels.initial_sorting,'فرز بدائي');
  assert.equal(labels.production_line,'خط الإنتاج');
  assert.equal(labels.printing,'الطباعة');
  assert.equal(labels.ironing,'المكواة');
  assert.equal(labels.presentation_quality,'جودة البرزنتيشن');
  assert.equal(labels.packing,'التعبئة');
  assert.equal(nextStageAction.packing,'إتمام الإنتاج وترحيل المخزون');
});

test('quality releases accepted units to finishing stages, not to saleable stock', () => {
  const db=prepared(),o=db.orders[0];
  g.addWorker(db, form({code:'WT-OP',name:'مشغل',rate:4}));
  const workerId=db.workers[0].id;
  g.advance(db,o.id);
  assert.equal(o.status,'cutting');
  assert.equal(db.materials[0].stock,80);
  while(o.status!=='quality')g.advance(db,o.id);
  assert.throws(()=>g.advance(db,o.id),/المقبول/);
  g.quality(db,o.id,form({good:8,reject:2,labor:25,overhead:5}));
  g.advance(db,o.id);
  assert.equal(o.status,'printing');
  assert.equal(db.finished.length,0);
  assert.equal(stageTargetQuantity(o),8);
  g.registerStageWork(db,form({orderId:o.id,workerId,quantity:7,batchRef:'PRINT-A'}));
  assert.throws(()=>g.advance(db,o.id),/كامل إنتاج المرحلة/);
  assert.throws(()=>g.registerStageWork(db,form({orderId:o.id,workerId,quantity:2}),/يتجاوز/));
  g.registerStageWork(db,form({orderId:o.id,workerId,quantity:1,batchRef:'PRINT-B'}));
  g.advance(db,o.id);
  assert.equal(o.status,'ironing');
  assert.equal(db.finished.length,0);
  while(o.status!=='packing')g.advance(db,o.id);
  assert.equal(db.finished.length,0);
  g.advance(db,o.id);
  assert.equal(o.status,'completed');
  assert.equal(db.finished.length,1);
  assert.equal(db.finished[0].qty,8);
  assert.equal(db.finished[0].unitCost,57.75);
  assert.equal(db.ledger.filter(x=>x.kind==='issue').length,1);
  assert.throws(()=>g.advance(db,o.id));
});

test('branding and GitHub Pages include the shared workflow without changing Supabase target',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(html,/<title>White tex/);
  assert.match(app,/WHITE TEX/);
  assert.match(app,/class="logo-accent"/);
  assert.match(css,/\.step\.current/);
  assert.match(pages,/cp src\/workflow\.mjs/);
  const cloud=readFileSync(new URL('../src/cloud-backup.mjs',import.meta.url),'utf8');
  assert.match(cloud,/yumeijsyiphzdsulsubf\.supabase\.co/);
});
