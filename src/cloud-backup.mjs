/* PremierOS Garments manual cloud backup only.
 * AMMCO is a shared Supabase instance; no access to AMMCO business tables.
 * Publishable key is safe for client distribution; RLS is enforced by database.
 * Do not put service_role / secret keys in the browser.
 */
const BASE_URL = 'https://yumeijsyiphzdsulsubf.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_ktXP7ss_qK6hZFmKybHw8A_89guYEK9';
let session = null; // Deliberately memory-only: credentials/tokens are not persisted in localStorage.

const REQUIRED_ARRAYS = ['styles', 'materials', 'orders', 'ledger', 'finished', 'audit'];
const OPTIONAL_ARRAYS = ['workers', 'workLogs', 'fabricRolls', 'cuttingBundles', 'wholesaleOrders', 'finishedDispatches'];

export function validateCloudSnapshot(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.version !== 1) {
    throw Error('ملف البيانات السحابي غير متوافق مع النسخة الحالية');
  }
  for (const key of REQUIRED_ARRAYS) if (!Array.isArray(payload[key])) throw Error('بيانات ناقصة: ' + key);
  for (const key of OPTIONAL_ARRAYS) if (payload[key] != null && !Array.isArray(payload[key])) {
    throw Error('بيانات غير صحيحة: ' + key);
  }
  const parsed = structuredClone(payload);
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
    body: [{ owner_id: identity.userId, payload }],
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
