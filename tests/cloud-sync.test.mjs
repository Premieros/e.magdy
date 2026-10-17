import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCloudSync,SYNC_INTERVAL_MS,hasBusinessData} from '../src/cloud-sync.mjs';
import {cloudLogin,cloudLogout,cloudSaveIfUnchanged,CloudConflictError} from '../src/cloud-backup.mjs';
import {__test as factory} from '../app.js';
import {readFileSync} from 'node:fs';
const fresh=()=>factory.fresh();
const entry=(id)=>{const db=fresh();db.materials.push({id,name:'قماش',unit:'متر',stock:10,avgCost:20});return db;};
const copy=data=>structuredClone(data);

test('cross-device sync is opt-in and never requires a main site login',()=>{
  let local=entry('local'),remote={data:entry('cloud'),updatedAt:'rev1'};
  const c=createCloudSync({getLocal:()=>local,applyRemote:data=>{local=copy(data);},
    load:async()=>copy(remote),save:async()=>{throw Error('unexpected upload');}});
  assert.equal(c.state().mode,'off');
  assert.equal(SYNC_INTERVAL_MS,20000);
  assert.equal(hasBusinessData(fresh()),false);
  assert.equal(hasBusinessData(local),true);
});
test('different copies require explicit resolution: no automatic overwrite after connecting',async()=>{
  let local=entry('local'),remote={data:entry('cloud'),updatedAt:'rev1'};
  let uploads=0;
  const c=createCloudSync({getLocal:()=>local,applyRemote:data=>{local=copy(data);},
    load:async()=>copy(remote),save:async()=>{uploads++;return 'rev2';}});
  assert.equal((await c.begin()).mode,'choose');
  assert.equal(local.materials[0].id,'local');
  assert.equal(uploads,0);
  assert.equal((await c.useCloud()).mode,'active');
  assert.equal(local.materials[0].id,'cloud');
  assert.equal(uploads,0);
});
test('local preferred copy is uploaded only at the remote revision last inspected',async()=>{
  let local=entry('local'),remote={data:entry('cloud'),updatedAt:'rev1'};
  const writes=[];
  const c=createCloudSync({getLocal:()=>local,applyRemote:data=>{local=copy(data);},
    load:async()=>copy(remote),save:async (db,revision)=>{writes.push({db:copy(db),revision});remote={data:copy(db),updatedAt:'rev2'};return 'rev2';}});
  await c.begin();
  assert.equal((await c.useLocal()).mode,'active');
  assert.equal(writes[0].revision,'rev1');
  assert.equal(writes[0].db.materials[0].id,'local');
  assert.equal(remote.data.materials[0].id,'local');
});
test('another device modifying remote before confirmation produces a conflict without writing',async()=>{
  let local=entry('local'),remote={data:entry('cloud'),updatedAt:'rev1'},writes=0;
  const c=createCloudSync({getLocal:()=>local,applyRemote:data=>{local=copy(data);},
    load:async()=>copy(remote),save:async()=>{writes++;return 'rev3';}});
  await c.begin();
  remote={data:entry('newer-cloud'),updatedAt:'rev2'};
  const result=await c.useLocal();
  assert.equal(result.mode,'conflict');
  assert.equal(writes,0);
  assert.equal(local.materials[0].id,'local');
});
test('clean device accepts remote changes; local edits push only if revision has not changed',async()=>{
  let local=entry('same'),remote={data:copy(local),updatedAt:'rev1'};
  const changes=[];
  const c=createCloudSync({getLocal:()=>local,applyRemote:data=>{local=copy(data);},
    load:async()=>copy(remote),save:async(db,rev)=>{changes.push({rev,db:copy(db)});remote={data:copy(db),updatedAt:'rev3'};return 'rev3';}});
  assert.equal((await c.begin()).mode,'active');
  remote={data:entry('device2'),updatedAt:'rev2'};
  assert.equal((await c.tick()).mode,'active');
  assert.equal(local.materials[0].id,'device2');
  local.materials[0].stock=25;
  assert.equal((await c.tick()).mode,'active');
  assert.equal(changes.length,1);
  assert.equal(changes[0].rev,'rev2');
  assert.equal(remote.data.materials[0].stock,25);
});
test('remote concurrent edits stop an automatic upload and preserve local inventory',async()=>{
  let local=entry('same'),remote={data:copy(local),updatedAt:'rev1'},tries=0;
  const c=createCloudSync({getLocal:()=>local,applyRemote:data=>{local=copy(data);},
    load:async()=>copy(remote),save:async()=>{tries++;throw new CloudConflictError();}});
  await c.begin();
  local.materials[0].stock=13;
  remote={data:entry('other'),updatedAt:'rev2'};
  assert.equal((await c.tick()).mode,'conflict');
  assert.equal(tries,1);
  assert.equal(local.materials[0].stock,13);
  assert.equal(remote.data.materials[0].id,'other');
});
test('offline changes remain on the device and can retry safely',async()=>{
  let local=entry('same'),remote={data:copy(local),updatedAt:'rev1'},connected=false;
  const c=createCloudSync({getLocal:()=>local,applyRemote:data=>{local=copy(data);},
    load:async()=>copy(remote),save:async(db)=>{if(!connected)throw Error('Network down');remote={data:copy(db),updatedAt:'rev2'};return 'rev2';}});
  await c.begin();
  local.materials[0].stock=4;
  assert.equal((await c.tick()).mode,'offline');
  assert.equal(local.materials[0].stock,4);
  connected=true;
  assert.equal((await c.tick()).mode,'active');
  assert.equal(remote.data.materials[0].stock,4);
});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('Supabase API accepts only conditional owner-scoped writes with the current user JWT',async()=>{
  const previousFetch=globalThis.fetch,uid='00000000-0000-4000-8000-000000000001',seen=[];
  try{
    globalThis.fetch=async (url,options)=>{
      seen.push({url,options});
      if(url.includes('/auth/v1/token'))return json({access_token:'test-token-only',expires_in:3600,user:{id:uid,email:'operator@test.example'}});
      if(options.method==='PATCH')return json([{owner_id:uid,updated_at:'2026-10-17T10:00:01.002Z'}]);
      if(options.method==='POST')return json([{owner_id:uid,updated_at:'2026-10-17T10:00:00.001Z'}]);
      throw Error('unexpected request');
    };
    await cloudLogin('operator@test.example','test-only-password');
    const first=await cloudSaveIfUnchanged(fresh(),null);
    assert.ok(first.includes('2026'));
    const second=await cloudSaveIfUnchanged(fresh(),'2026-10-17T10:00:00.001Z');
    assert.ok(second.includes('2026'));
    assert.match(seen[2].url,/owner_id=eq\.00000000-0000-4000-8000-000000000001/);
    assert.match(seen[2].url,/updated_at=eq\.2026-10-17/);
    assert.equal(seen[2].options.method,'PATCH');
    assert.equal(seen[2].options.headers.Authorization,'Bearer test-token-only');
    assert.equal(JSON.parse(seen[2].options.body).payload.version,1);
    assert.equal(JSON.parse(seen[1].options.body)[0].owner_id,uid);
  }finally{cloudLogout();globalThis.fetch=previousFetch;}
});
test('stale revisions cannot overwrite remote: zero updated rows yields CloudConflictError',async()=>{
  const previousFetch=globalThis.fetch,uid='00000000-0000-4000-8000-000000000001';
  try{
    globalThis.fetch=async(url,options)=>url.includes('/auth/v1/token')
      ?json({access_token:'test-token-only',expires_in:3600,user:{id:uid,email:'operator@test.example'}}):json([]);
    await cloudLogin('operator@test.example','test-only-password');
    await assert.rejects(cloudSaveIfUnchanged(fresh(),'2026-10-17T10:00:00.000Z'),CloudConflictError);
  }finally{cloudLogout();globalThis.fetch=previousFetch;}
});
test('existing GitHub Pages site packages the sync module and keeps all business data behind authenticated cloud access',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const cloud=readFileSync(new URL('../src/cloud-backup.mjs',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(app,/syncPanel\(\)/);
  assert.match(app,/sync\.tick\(\)/);
  assert.match(app,/sync-stop/);
  assert.match(app,/cloudIdentity\(\)/);
  assert.match(cloud,/requireIdentity\(\)/);
  assert.match(cloud,/updated_at=eq\./);
  assert.match(pages,/src\/cloud-sync\.mjs/);
  assert.doesNotMatch(cloud,/service_role|sb_secret_/i);
});
