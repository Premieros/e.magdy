import { validateAccountingState } from './accounting.mjs';
import { ensureAccessConfig, validateAccessConfig } from './access-control.mjs';
/* PremierOS Garments manual cloud backup only.
 * AMMCO is a shared Supabase instance; no access to AMMCO business tables.
 * Publishable key is safe for client distribution; RLS is enforced by database.
 * Do not put service_role / secret keys in the browser.
 */
const BASE_URL = 'https://yumeijsyiphzdsulsubf.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_ktXP7ss_qK6hZFmKybHw8A_89guYEK9';
let session = null; // Deliberately memory-only: credentials/tokens are not persisted in localStorage.

const REQUIRED_ARRAYS = ['styles', 'materials', 'orders', 'ledger', 'finished', 'audit'];
const OPTIONAL_ARRAYS = ['workers', 'workLogs', 'fabricRolls', 'cuttingBundles', 'wholesaleOrders', 'finishedDispatches', 'notifications', 'financeEntries', 'appRoles', 'appUsers'];

export function validateCloudSnapshot(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.version !== 1) {
    throw Error('ملف البيانات السحابي غير متوافق مع النسخة الحالية');
  }
  for (const key of REQUIRED_ARRAYS) if (!Array.isArray(payload[key])) throw Error('بيانات ناقصة: ' + key);
  for (const key of OPTIONAL_ARRAYS) if (payload[key] != null && !Array.isArray(payload[key])) {
    throw Error('بيانات غير صحيحة: ' + key);
  }
  const parsed = structuredClone(payload);
  // Legacy snapshots must receive default roles BEFORE optional arrays are initialized.
  ensureAccessConfig(parsed);
  for (const key of OPTIONAL_ARRAYS) parsed[key] ??= [];
  for (const m of parsed.materials) {
    if (typeof m !== 'object' || !m || !Number.isFinite(m.stock) || m.stock < 0) {
      throw Error('رصيد خامة غير صحيح في النسخة السحابية');
    }
  }
  for (const r of parsed.fabricRolls) {
    if (!r || !Number.isFinite(r.remaining) || r.remaining < 0 || !Number.isFinite(r.received)
      || r.remaining > r.received || r.received <= 0) {
      throw Error('بيانات رول غير صحيحة في النسخة السحابية');
    }
  }
  validateAccountingState(parsed);
  validateAccessConfig(parsed);
  return parsed;
}

export function cloudIdentity() {
  if (!session || Date.now() >= session.expiresAt) return null;
  return { userId: session.userId, email: session.email };
}
function requireIdentity() {
  if (!cloudIdentity()) {
    session = null;
    throw Error('انتهت الجلسة؛ سجّل الدخول مرة أخرى');
  }
  return session;
}
async function callApi(path, { token, method = 'GET', body, prefer } = {}) {
  const headers = { apikey: PUBLISHABLE_KEY };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  let response;
  try {
    response = await fetch(BASE_URL + path, {
      method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw Error('تعذر الاتصال بـ Supabase. تحقق من الإنترنت ثم حاول مجددًا');
  }
  const raw = await response.text();
  let payload;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
  if (!response.ok) {
    throw Error(payload?.msg || payload?.message || payload?.error_description || payload?.error
      || 'تعذر تنفيذ طلب النسخ السحابي (' + response.status + ')');
  }
  return payload;
}
export async function cloudLogin(email, password) {
  const login = String(email || '').trim().toLowerCase();
  if (!login.includes('@') || !password) throw Error('أدخل البريد الإلكتروني وكلمة المرور');
  const response = await callApi('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email: login, password },
  });
  if (!response?.access_token || !response?.user?.id) throw Error('لم يتم إنشاء جلسة صالحة');
  const expiresAt = Date.now() + Math.max(1, Number(response.expires_in || 3600) - 60) * 1000;
  session = { token: response.access_token, userId: response.user.id, email: response.user.email || login, expiresAt };
  return cloudIdentity();
}
export function cloudLogout() {
  session = null; // Access token is never written to disk.
}
export async function cloudSave(currentDb) {
  const identity = requireIdentity();
  const payload = validateCloudSnapshot(currentDb);
  const result = await callApi('/rest/v1/garment_cloud_snapshots?on_conflict=owner_id', {
    method: 'POST', token: identity.token, prefer: 'resolution=merge-duplicates,return=representation',
    body: [{ owner_id: identity.userId, payload, updated_at: new Date().toISOString() }],
  });
  if (!Array.isArray(result) || result.length !== 1 || result[0].owner_id !== identity.userId) {
    throw Error('لم يتم تأكيد حفظ النسخة السحابية');
  }
  return result[0].updated_at;
}
export async function cloudLoad() {
  const identity = requireIdentity();
  const rows = await callApi('/rest/v1/garment_cloud_snapshots?owner_id=eq.'
    + encodeURIComponent(identity.userId) + '&select=payload,updated_at&limit=1', {
    token: identity.token,
  });
  if (!Array.isArray(rows)) throw Error('استجابة غير متوقعة من قاعدة البيانات');
  if (!rows.length) return null;
  return { data: validateCloudSnapshot(rows[0].payload), updatedAt: rows[0].updated_at };
}


/* Separate central customer-order intake. Browser may read/write ONLY through RLS. */
export async function cloudFactoryList() {
  const identity=requireIdentity();
  const [factories, memberships]=await Promise.all([
    callApi('/rest/v1/garment_factories?select=id,code,name&order=name.asc', {token:identity.token}),
    callApi('/rest/v1/garment_staff?select=factory_id,role,active&user_id=eq.'
      +encodeURIComponent(identity.userId), {token:identity.token}),
  ]);
  if(!Array.isArray(factories)||!Array.isArray(memberships))throw Error('تعذر تحميل صلاحيات المصنع');
  return factories.map(f=>({...f,role:memberships.find(m=>m.factory_id===f.id&&m.active)?.role||'viewer'}));
}
export async function cloudIntakeOrders(factoryId) {
  const identity=requireIdentity();
  if(!/^[0-9a-f-]{36}$/i.test(String(factoryId)))throw Error('معرّف المصنع غير صالح');
  const rows=await callApi('/rest/v1/garment_intake_orders?factory_id=eq.'
    +encodeURIComponent(factoryId)+'&select=id,factory_id,customer_name,customer_contact,notes,lines,status,created_at,created_by&order=created_at.desc&limit=100',
    {token:identity.token});
  if(!Array.isArray(rows))throw Error('تعذر قراءة الطلبات');
  return rows;
}
export async function cloudCreateIntakeOrder(factoryId,data) {
  const identity=requireIdentity();
  if(!/^[0-9a-f-]{36}$/i.test(String(factoryId)))throw Error('معرّف المصنع غير صالح');
  if(!data||!Array.isArray(data.lines)||!data.lines.length)throw Error('بنود طلب غير صحيحة');
  const rows=await callApi('/rest/v1/garment_intake_orders', {
    method:'POST',token:identity.token,prefer:'return=representation',
    body:[{
      factory_id:factoryId,created_by:identity.userId,
      customer_name:data.customer_name,customer_contact:data.customer_contact,
      notes:data.notes,lines:data.lines,status:'new',
    }],
  });
  if(!Array.isArray(rows)||rows.length!==1||rows[0].factory_id!==factoryId
    ||rows[0].created_by!==identity.userId){
    throw Error('لم يتم تأكيد حفظ الطلب في قاعدة البيانات');
  }
  return rows[0];
}

/** Optimistic locking for two devices using the existing owner-scoped snapshot table.
 * PATCH is allowed only if updated_at still equals the revision last observed.
 * A missing row is created, never silently overwritten.
 */
export class CloudConflictError extends Error {
  constructor(message='هناك تحديث أحدث من جهاز آخر؛ لم نستبدل أي بيانات') {
    super(message); this.name='CloudConflictError';
  }
}
export async function cloudSaveIfUnchanged(currentDb, expectedUpdatedAt) {
  const identity=requireIdentity();
  const payload=validateCloudSnapshot(currentDb);
  const updatedAt=new Date().toISOString();
  let rows;
  if (expectedUpdatedAt===null) {
    try {
      rows=await callApi('/rest/v1/garment_cloud_snapshots?select=owner_id,updated_at', {
        method:'POST',token:identity.token,prefer:'return=representation',
        body:[{owner_id:identity.userId,payload,updated_at:updatedAt}]
      });
    } catch (error) {
      if(/409|23505|duplicate|مكرر/i.test(String(error.message)))throw new CloudConflictError();
      throw error;
    }
  } else {
    if(typeof expectedUpdatedAt!=='string'||!expectedUpdatedAt)throw Error('نسخة المقارنة غير صالحة');
    rows=await callApi('/rest/v1/garment_cloud_snapshots?owner_id=eq.'
      +encodeURIComponent(identity.userId)+'&updated_at=eq.'
      +encodeURIComponent(expectedUpdatedAt)+'&select=owner_id,updated_at',{
      method:'PATCH',token:identity.token,prefer:'return=representation',
      body:{payload,updated_at:updatedAt}
    });
    if(Array.isArray(rows)&&rows.length===0)throw new CloudConflictError();
  }
  if(!Array.isArray(rows)||rows.length!==1||rows[0].owner_id!==identity.userId
    ||typeof rows[0].updated_at!=='string')throw Error('لم يتم تأكيد مزامنة البيانات');
  return rows[0].updated_at;
}
