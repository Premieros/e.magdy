import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCloudSnapshot, cloudLogin, cloudIdentity, cloudSave, cloudLoad, cloudLogout,
} from '../src/cloud-backup.mjs';

const fresh = () => ({version:1, styles:[],materials:[],orders:[],ledger:[],finished:[],audit:[]});
const response = (body, status=200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type':'application/json' },
});

test('cloud validator accepts legacy offline snapshots and adds only optional arrays', () => {
  const sample = fresh();
  const validated = validateCloudSnapshot(sample);
  assert.deepEqual(validated.workers, []);
  assert.deepEqual(validated.workLogs, []);
  assert.deepEqual(validated.fabricRolls, []);
  assert.equal(Object.hasOwn(sample,'workers'),false);
  assert.throws(() => validateCloudSnapshot({...sample,version:2}), /غير متوافق/);
  assert.throws(() => validateCloudSnapshot({...sample, materials:null}), /بيانات ناقصة/);
  assert.throws(() => validateCloudSnapshot({...sample,materials:[{stock:-1}]}), /رصيد/);
  assert.throws(() => validateCloudSnapshot({...sample,fabricRolls:[{received:2,remaining:3}]}), /رول/);
});

test('cloud backup requires an authenticated session',async () => {
  cloudLogout();
  await assert.rejects(cloudSave(fresh()), /الجلسة/);
  await assert.rejects(cloudLoad(), /الجلسة/);
});

test('cloud login, save and restore are scoped to the signed-in user',async () => {
  const originalFetch=globalThis.fetch;
  const received=[];
  const uid='00000000-0000-4000-8000-000000000001';
  try {
    globalThis.fetch=async (url,options) => {
      received.push({url,options});
      if (url.includes('/auth/v1/token')) {
        return response({access_token:'test-only-access-token',expires_in:3600,
          user:{id:uid,email:'operator@example.test'}});
      }
      if (url.includes('/rest/v1/garment_cloud_snapshots') && options.method === 'POST') {
        const rows=JSON.parse(options.body);
        return response([{owner_id:rows[0].owner_id,updated_at:'2026-10-11T00:00:00Z'}]);
      }
      if (url.includes('/rest/v1/garment_cloud_snapshots') && options.method === 'GET') {
        return response([{payload:fresh(),updated_at:'2026-10-11T00:00:00Z'}]);
      }
      throw Error('unexpected URL');
    };
    await cloudLogin('operator@example.test','safe-test-password');
    assert.equal(cloudIdentity()?.userId,uid);
    const savedAt=await cloudSave(fresh());
    assert.equal(savedAt,'2026-10-11T00:00:00Z');
    const loaded=await cloudLoad();
    assert.equal(loaded.data.version,1);
    assert.equal(loaded.data.workLogs.length,0);
    assert.equal(received.length,3);
    const post=received[1],get=received[2];
    assert.equal(JSON.parse(post.options.body)[0].owner_id,uid);
    assert.equal(post.options.headers.Authorization,'Bearer test-only-access-token');
    assert.match(get.url,/owner_id=eq\.00000000-0000-4000-8000-000000000001/);
    assert.equal(get.options.headers.Authorization,'Bearer test-only-access-token');
    assert(!post.options.headers.apikey.startsWith('sb_secret_'));
  } finally {
    cloudLogout();
    globalThis.fetch=originalFetch;
  }
  assert.equal(cloudIdentity(),null);
});
