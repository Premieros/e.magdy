/* White tex browser-local activity center.
 * Only confirmed, committed operations become notifications.
 * Never sends records to an external service or changes Supabase data.
 */
import { labels } from './workflow.mjs';

export const NOTIFICATION_LIMIT = 160;
export const LOW_STOCK_LEVEL = 25;
export const notificationIcons = Object.freeze({
  stage:'⚡', stock:'📦', warning:'⚠️', success:'🏆', quality:'🎯',
  order:'📋', delivery:'🚚', worker:'🧵', info:'✦', error:'⛔'
});
const stamp = () => new Date().toISOString();
const uid = () => globalThis.crypto?.randomUUID?.() ??
  'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2);
const items = (db, key) => Array.isArray(db?.[key]) ? db[key] : [];
const added = (before, after, key) => {
  const ids = new Set(items(before,key).map(row=>row.id));
  return items(after,key).filter(row=>!ids.has(row.id));
};
const text = value => String(value ?? '');
const label = stage => labels[stage] || text(stage) || 'مرحلة غير معروفة';

export function newNotification(type, title, detail='', orderId=null, reference='') {
  return {id:uid(), type, title:text(title), detail:text(detail), orderId,
    reference:text(reference), at:stamp(), read:false};
}
export function ensureNotifications(db) {
  if (db.notifications === undefined) db.notifications = [];
  if (!Array.isArray(db.notifications)) throw Error('سجل الإشعارات غير متوافق');
  return db;
}
export function unreadCount(db) {
  return items(db,'notifications').filter(row=>!row.read).length;
}
export function appendNotifications(db, incoming) {
  ensureNotifications(db);
  db.notifications = [...incoming, ...db.notifications].slice(0,NOTIFICATION_LIMIT);
  return db.notifications;
}

/** Derive meaningful alerts from committed inventory, production and sales diffs. */
export function buildNotifications(before, after) {
  const events = [];
  const push = (type,title,detail,orderId=null,reference='') =>
    events.push(newNotification(type,title,detail,orderId,reference));
  const orders = new Map(items(after,'orders').map(o=>[o.id,o]));
  const oldOrders = new Map(items(before,'orders').map(o=>[o.id,o]));
  const mats = new Map(items(after,'materials').map(m=>[m.id,m]));

  for (const movement of added(before,after,'ledger')) {
    const mat = mats.get(movement.materialId);
    const qty = Math.abs(Number(movement.qty)||0);
    const measure = mat?.unit || 'وحدة';
    const name = mat?.name || 'خامة';
    const issued = Number(movement.qty) < 0;
    const ref = text(movement.reference);
    push(issued?'stock':'success',
      issued?'خصم من مخزون الخامات':'استلام خامات بالمخزن',
      qty+' '+measure+' • '+name+(ref?' • '+ref:''),
      movement.orderId||null,ref);
  }
  for (const o of items(after,'orders')) {
    const previous = oldOrders.get(o.id);
    if (!previous) {
      push('order','أمر تصنيع جديد',o.ref+' • '+o.qty+' قطعة',o.id,o.ref);
    } else if (previous.status !== o.status) {
      const complete = o.status==='completed';
      push(complete?'success':o.status==='quality'?'quality':'stage',
        complete?'اكتملت جميع مراحل التصنيع':previous.status==='planned'?'بدأ القص':'انتهت مرحلة '+label(previous.status),
        o.ref+' • '+(complete?'مكتمل': 'المرحلة التالية: '+label(o.status)),o.id,o.ref);
    }
    if (previous && (previous.good!==o.good || previous.reject!==o.reject) && o.status==='quality') {
      push('quality','نتيجة فحص الجودة',
        o.ref+' • مقبول '+o.good+' / مرفوض '+o.reject,o.id,o.ref);
    }
  }
  for (const row of added(before,after,'finished')) {
    const o=orders.get(row.orderId);
    push('success','تم ترحيل الإنتاج للمخزون التام',
      (o?.ref||'أمر تصنيع')+' • '+row.qty+' قطعة جاهزة للبيع',row.orderId,o?.ref||'');
  }
  for (const row of added(before,after,'workLogs')) {
    const o=orders.get(row.orderId);
    push('worker','تسجيل إنتاج العامل',
      (o?.ref||'أمر تصنيع')+' • '+label(row.stage)+' • '+row.qty+' قطعة',row.orderId,o?.ref||'');
  }
  for (const row of added(before,after,'wholesaleOrders')) {
    push('order','طلب جملة جديد',row.ref+' • '+(row.customer||'عميل'),null,row.ref);
  }
  for (const row of added(before,after,'finishedDispatches')) {
    const quantity=items(row,'lines').reduce((sum,line)=>sum+(Number(line.qty)||0),0);
    push('delivery','تم تسليم بضاعة وخصم التام',
      row.reference+' • '+quantity+' قطعة • '+(row.customer||'عميل'),null,row.reference);
  }
  const previousMaterials = new Map(items(before,'materials').map(m=>[m.id,m]));
  for (const mat of items(after,'materials')) {
    const old = previousMaterials.get(mat.id);
    if (old && Number(old.stock)>=LOW_STOCK_LEVEL && Number(mat.stock)<LOW_STOCK_LEVEL) {
      push('warning','تنبيه انخفاض المخزون',
        mat.name+' • المتبقي '+mat.stock+' '+(mat.unit||'وحدة'));
    }
  }
  // Audit-backed fallback for actions that do not affect stock or stage:
  // worker registration, BOM changes, style creation and cutting bundles.
  if (!events.length) {
    for (const row of added(before,after,'audit').slice(0,10)) {
      push('info','نشاط مسجل',row.message||'تم تحديث البيانات');
    }
  }
  return events.slice(0,NOTIFICATION_LIMIT);
}
