import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __test as g } from '../app.js';

const form = fields => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, String(value));
  return data;
};
function setup() {
  const db = g.fresh();
  g.newMaterial(db, form({ code: 'FAB1', name: 'قطن', category: 'أقمشة', unit: 'متر' }));
  g.receive(db, form({ materialId: db.materials[0].id, quantity: 100, unitCost: 20, reference: 'OLD' }));
  g.newStyle(db, form({ code: 'SH10', name: 'قميص', sizes: 'M', colors: 'أبيض', price: 400 }));
  g.setBom(db, db.styles[0].id, form({ ['bom_' + db.materials[0].id]: '2' }));
  g.newOrder(db, form({ styleId: db.styles[0].id, variantId: db.styles[0].variants[0].id, quantity: 10 }));
  return db;
}

test('prior local database snapshots are upgraded without data loss', () => {
  const db = setup();
  delete db.fabricRolls;
  delete db.workers;
  delete db.workLogs;
  g.ensureFactoryState(db);
  assert.equal(db.orders.length, 1);
  assert.deepEqual(db.fabricRolls, []);
  assert.deepEqual(db.workers, []);
  assert.deepEqual(db.workLogs, []);
  assert.throws(() => g.ensureFactoryState({ workers: {} }), /غير متوافقة/);
});

test('receiving fabric rolls increases material stock and retains roll identity', () => {
  const db = setup();
  const materialId = db.materials[0].id;
  g.receiveFabricRoll(db, form({ materialId, rollNo: 'R-001', shade: 'B1',
    width: 150, quantity: 35, unitCost: 30 }));
  assert.equal(db.materials[0].stock, 135);
  assert.equal(db.materials[0].avgCost, 22.59);
  assert.equal(db.fabricRolls[0].remaining, 35);
  assert.equal(db.fabricRolls[0].width, 150);
  assert.equal(db.ledger.filter(row => row.kind === 'receive').length, 2);
  assert.throws(() => g.receiveFabricRoll(db, form({
    materialId, rollNo: 'R-001', quantity: 20, unitCost: 4
  })), /مكرر/);
});

test('cutting consumes registered rolls FIFO and reconciles untracked stock', () => {
  const db = setup();
  const materialId = db.materials[0].id;
  g.receiveFabricRoll(db, form({ materialId, rollNo: 'R1', quantity: 15, unitCost: 10 }));
  g.receiveFabricRoll(db, form({ materialId, rollNo: 'R2', quantity: 10, unitCost: 10 }));
  const oid = db.orders[0].id;
  g.advance(db, oid);
  assert.equal(db.materials[0].stock, 105);
  assert.equal(db.orders[0].rollAllocations.reduce((sum, row) => sum + row.qty, 0), 20);
  assert.equal(db.fabricRolls.find(r => r.rollNo === 'R1').remaining, 0);
  assert.equal(db.fabricRolls.find(r => r.rollNo === 'R2').remaining, 5);
  assert.equal(db.ledger.filter(x => x.kind === 'issue').length, 1);
  g.advance(db, oid);
  assert.equal(db.materials[0].stock, 105);
});

test('piecework recording is bounded by order and duplicate batch references are rejected', () => {
  const db = setup();
  g.addWorker(db, form({ code: 'W1', name: 'عامل خياطة', role: 'قص', rate: 5 }));
  const workerId = db.workers[0].id, orderId = db.orders[0].id;
  assert.throws(() => g.registerStageWork(db, form({ orderId, workerId, quantity: 1 })), /متاح فقط/);
  g.advance(db, orderId);
  g.registerStageWork(db, form({ orderId, workerId, quantity: 3, batchRef: 'CUT1' }));
  assert.equal(g.stageProgress(db, orderId, 'cutting').quantity, 3);
  assert.equal(g.pieceworkCost(db, orderId), 15);
  assert.throws(() => g.registerStageWork(db, form({ orderId, workerId, quantity: 3, batchRef: 'CUT1' })), /مسجل/);
  assert.throws(() => g.advance(db, orderId), /كامل إنتاج المرحلة/);
  assert.throws(() => g.registerStageWork(db, form({ orderId, workerId, quantity: 8 })), /يتجاوز/);
  g.registerStageWork(db, form({ orderId, workerId, quantity: 7, batchRef: 'CUT2' }));
  assert.equal(g.pieceworkCost(db, orderId), 50);
  g.advance(db, orderId);
  assert.equal(db.orders[0].status, 'sewing');
  assert.equal(g.stageProgress(db, orderId, 'cutting').quantity, 10);
});

test('worker piecework is included exactly once in finished unit cost', () => {
  const db = setup();
  const order = db.orders[0];
  g.addWorker(db, form({ code: 'OP1', name: 'عامل', rate: 4 }));
  g.advance(db, order.id);
  g.registerStageWork(db, form({ orderId: order.id, workerId: db.workers[0].id, quantity: 10 }));
  for (let i = 0; i < 3; i++) g.advance(db, order.id);
  assert.equal(order.status, 'quality');
  g.quality(db, order.id, form({ good: 9, reject: 1, labor: 90, overhead: 45 }));
  g.advance(db, order.id);
  assert.equal(order.status, 'completed');
  assert.equal(g.pieceworkCost(db, order.id), 40);
  assert.equal(db.finished[0].unitCost, 63.89);
  assert.throws(() => g.advance(db, order.id));
  assert.equal(db.finished.length, 1);
});

test('invalid fabric roll does not change material quantity', () => {
  const db = setup();
  const initial = db.materials[0].stock;
  assert.throws(() => g.receiveFabricRoll(db, form({
    materialId: db.materials[0].id, rollNo: 'BAD', quantity: -1, unitCost: 3
  })));
  assert.equal(db.materials[0].stock, initial);
});
