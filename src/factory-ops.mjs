/* Offline factory controls: scoped to one browser, never synced or authenticated. */
const serial = () => globalThis.crypto?.randomUUID?.() ?? ('w-' + Date.now() + '-' + Math.random().toString(36).slice(2));
const text = value => String(value ?? '').trim();
const number = (value, name, allowZero = false) => {
  const n = Number(value);
  if (!Number.isFinite(n) || (allowZero ? n < 0 : n <= 0)) throw Error(name + ' غير صالح');
  return n;
};
const units = n => Math.round((n + Number.EPSILON) * 10000) / 10000;
const money = n => Math.round((n + Number.EPSILON) * 100) / 100;
const stamp = () => new Date().toISOString();

export function ensureFactoryState(db) {
  for (const key of ['workers', 'workLogs', 'fabricRolls', 'cuttingBundles']) {
    if (db[key] === undefined) db[key] = [];
    if (!Array.isArray(db[key])) throw Error('بيانات غير متوافقة: ' + key);
  }
  return db;
}
export function addWorker(db, f) {
  ensureFactoryState(db);
  const code = text(f.get('code')).toUpperCase();
  const name = text(f.get('name'));
  if (!code || !name) throw Error('كود العامل واسمه مطلوبان');
  if (db.workers.some(w => w.code === code)) throw Error('كود العامل مستخدم');
  const rate = money(number(f.get('rate'), 'أجر القطعة', true));
  db.workers.unshift({ id: serial(), code, name, role: text(f.get('role')) || 'عامل إنتاج',
    rate, active: true, createdAt: stamp() });
  db.audit.unshift({ id: serial(), at: stamp(), message: 'تسجيل العامل ' + code });
}
export function pieceworkCost(db, orderId) {
  return money((db.workLogs || []).filter(x => x.orderId === orderId)
    .reduce((sum, x) => sum + x.cost, 0));
}
export function stageProgress(db, orderId, stage) {
  const logs = (db.workLogs || []).filter(x => x.orderId === orderId && x.stage === stage);
  return { quantity: logs.reduce((sum, x) => sum + x.qty, 0), cost: money(logs.reduce((sum, x) => sum + x.cost, 0)), records: logs.length };
}
export function registerStageWork(db, f) {
  ensureFactoryState(db);
  const order = db.orders.find(x => x.id === f.get('orderId'));
  if (!order || !['cutting', 'sewing', 'finishing'].includes(order.status)) {
    throw Error('تسجيل الإنتاج متاح فقط في القص أو الخياطة أو التشطيب');
  }
  const worker = db.workers.find(x => x.id === f.get('workerId') && x.active);
  if (!worker) throw Error('اختر عاملًا نشطًا');
  const qty = number(f.get('quantity'), 'عدد القطع');
  if (!Number.isSafeInteger(qty)) throw Error('عدد القطع يجب أن يكون صحيحًا');
  const progress = stageProgress(db, order.id, order.status);
  if (progress.quantity + qty > order.qty) throw Error('إنتاج المرحلة يتجاوز كمية أمر التصنيع');
  const batchRef = text(f.get('batchRef'));
  if (batchRef && db.workLogs.some(x => x.orderId === order.id && x.stage === order.status && x.batchRef === batchRef)) {
    throw Error('رقم الدفعة مسجل بالفعل لهذه المرحلة');
  }
  const rate = worker.rate;
  db.workLogs.unshift({ id: serial(), orderId: order.id, workerId: worker.id,
    stage: order.status, qty, rate, cost: money(qty * rate), batchRef, at: stamp() });
  db.audit.unshift({ id: serial(), at: stamp(), message: 'إنتاج ' + qty + ' قطعة في ' + order.status + ' للأمر ' + order.ref });
}
export function checkStageBeforeAdvance(db, order) {
  if (!['cutting', 'sewing', 'finishing'].includes(order.status)) return;
  const progress = stageProgress(db, order.id, order.status);
  // Legacy orders without work logs retain their existing streamlined workflow.
  // Once tracking starts, the entire stage must be reconciled.
  if (progress.records && progress.quantity !== order.qty) {
    throw Error('يجب تسجيل كامل إنتاج المرحلة: المسجل ' + progress.quantity + ' من ' + order.qty);
  }
}
export function receiveFabricRoll(db, f) {
  ensureFactoryState(db);
  const material = db.materials.find(x => x.id === f.get('materialId'));
  if (!material || material.unit !== 'متر') throw Error('اختر خامة قماش بوحدة متر');
  const rollNo = text(f.get('rollNo')).toUpperCase();
  if (!rollNo) throw Error('رقم الرول مطلوب');
  if (db.fabricRolls.some(r => r.materialId === material.id && r.rollNo === rollNo)) throw Error('رقم الرول مكرر لنفس القماش');
  const received = units(number(f.get('quantity'), 'طول الرول'));
  const unitCost = money(number(f.get('unitCost'), 'تكلفة المتر', true));
  const width = text(f.get('width')) ? number(f.get('width'), 'عرض القماش') : null;
  const previous = material.stock * material.avgCost;
  material.avgCost = money((previous + received * unitCost) / (material.stock + received));
  material.stock = units(material.stock + received);
  const roll = { id: serial(), materialId: material.id, rollNo, shade: text(f.get('shade')),
    width, received, remaining: received, unitCost, at: stamp() };
  db.fabricRolls.unshift(roll);
  db.ledger.unshift({ id: serial(), at: stamp(), materialId: material.id,
    qty: received, cost: unitCost, kind: 'receive', reference: 'رول ' + rollNo, rollId: roll.id });
  db.audit.unshift({ id: serial(), at: stamp(), message: 'استلام رول ' + rollNo + ' (' + received + ' متر)' });
}
export function allocateFabricRolls(db, materialId, quantity, orderId) {
  ensureFactoryState(db);
  const material = db.materials.find(x => x.id === materialId);
  if (!material) throw Error('الخامة غير موجودة');
  const rolls = db.fabricRolls.filter(r => r.materialId === materialId && r.remaining > 0)
    .sort((a, b) => a.at.localeCompare(b.at) || a.rollNo.localeCompare(b.rollNo));
  const tracked = units(rolls.reduce((sum, r) => sum + r.remaining, 0));
  if (tracked > material.stock + 0.0001) throw Error('رصيد رولات القماش لا يطابق إجمالي المخزون');
  let left = units(quantity);
  const allocations = [];
  for (const roll of rolls) {
    if (left <= 0) break;
    const taken = units(Math.min(left, roll.remaining));
    roll.remaining = units(roll.remaining - taken);
    left = units(left - taken);
    allocations.push({ orderId, materialId, rollId: roll.id, rollNo: roll.rollNo, qty: taken });
  }
  // Any balance is legacy/untracked stock: never silently create a fictitious roll.
  if (left > units(material.stock - tracked) + 0.0001) throw Error('رصيد القماش غير المتتبع بالرول لا يكفي');
  if (left > 0) allocations.push({ orderId, materialId, rollId: null, rollNo: 'رصيد بدون رول', qty: left });
  return allocations;
}
