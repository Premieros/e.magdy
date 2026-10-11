import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIntakeOrder, parseIntakeLines, intakeOrderTotal } from '../src/cloud-intake.mjs';
import { cloudLogin, cloudLogout, cloudIdentity, cloudFactoryList, cloudIntakeOrders, cloudCreateIntakeOrder } from '../src/cloud-backup.mjs';
const form=fields=>{const f=new FormData();for(const [k,v] of Object.entries(fields))f.set(k,String(v));return f;};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('new cloud order must have valid bounded multiple SKU lines',()=>{
  const f=form({customerName:'تاجر تجريبي',customerContact:'01000000000',notes:'طلب مبدئي',
    linesRaw:'SH-1-M-BLK | M | أسود | 12 | 350.25\nSH-1-L-WHT | L | أبيض | 8 | 350'});
  const data=buildIntakeOrder(f);
  assert.equal(data.customer_name,'تاجر تجريبي');
  assert.equal(data.lines.length,2);
  assert.deepEqual(intakeOrderTotal(data),{quantity:20,amount:7003});
  assert.throws(()=>parseIntakeLines('SKU | M | أسود | 0 | 3'),/الكمية/);
  assert.throws(()=>parseIntakeLines('SKU | M | أسود | 3.5 | 4'),/الكمية/);
  assert.throws(()=>parseIntakeLines('SKU | M | أسود | 3 | 4.999'),/السعر/);
  assert.throws(()=>parseIntakeLines('SKU | M | أسود | 3'),/السطر/);
  assert.throws(()=>parseIntakeLines(Array.from({length:51},()=> 'SKU | M | أسود | 1 | 1').join('\n')),/50/);
  assert.throws(()=>buildIntakeOrder(form({customerName:'',linesRaw:'SKU | M | أسود | 1 | 1'})),/العميل/);
});
test('cloud intake requires authentication and never stores a static credential',async ()=>{
  cloudLogout();
  await assert.rejects(cloudFactoryList(),/الجلسة/);
  await assert.rejects(cloudIntakeOrders('00000000-0000-4000-8000-000000000001'),/الجلسة/);
  await assert.rejects(cloudCreateIntakeOrder('00000000-0000-4000-8000-000000000001',{lines:[]}),/الجلسة/);
  const code=readFileSync(new URL('../src/cloud-backup.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(code,/const\s+[^\n]*?(?:sb_secret_|service_role)/);
});
test('central factory list, intake read and create use signed-in RLS REST with factory id',async ()=>{
  const original=globalThis.fetch;
  const calls=[];
  const uid='00000000-0000-4000-8000-000000000001', fid='00000000-0000-4000-8000-000000000002';
  try{
    globalThis.fetch=async(url,options)=>{
      calls.push({url,options});
      if(url.includes('/auth/v1/token'))return response({access_token:'only-test-access',expires_in:3600,user:{id:uid,email:'sample@example.test'}});
      if(url.includes('/garment_factories'))return response([{id:fid,code:'demo-factory',name:'مصنع تجريبي'}]);
      if(url.includes('/garment_staff'))return response([{factory_id:fid,role:'manager',active:true}]);
      if(url.includes('/garment_intake_orders')&&options.method==='POST'){
        const data=JSON.parse(options.body)[0];
        return response([{id:'o1',...data,created_at:'2026-10-11T10:00:00Z'}]);
      }
      if(url.includes('/garment_intake_orders'))return response([{id:'o1',factory_id:fid,lines:[{sku:'SKU',qty:1,unitPrice:10}],customer_name:'عميل'}]);
      throw Error('unhandled URL '+url);
    };
    await cloudLogin('sample@example.test','test-password');
    assert.equal(cloudIdentity().userId,uid);
    const factories=await cloudFactoryList();
    assert.equal(factories.length,1);assert.equal(factories[0].role,'manager');
    const loaded=await cloudIntakeOrders(fid);
    assert.equal(loaded.length,1);
    const data={customer_name:'عميل',customer_contact:'',notes:'',lines:[{sku:'SKU',size:'M',color:'أسود',qty:1,unitPrice:10}]};
    const saved=await cloudCreateIntakeOrder(fid,data);
    assert.equal(saved.factory_id,fid);
    const posted=calls.find(x=>x.options.method==='POST'&&x.url.includes('garment_intake_orders'));
    assert.equal(JSON.parse(posted.options.body)[0].created_by,uid);
    assert.equal(posted.options.headers.Authorization,'Bearer only-test-access');
    assert(calls.some(x=>x.url.includes('/garment_intake_orders?factory_id=eq.'+fid)));
    assert.equal(calls.filter(x=>x.url.includes('/garment_')).length,4);
  }finally{globalThis.fetch=original;cloudLogout();}
});
test('migration isolates tenant-bound data and gives authenticated staff read-only permissions',()=>{
  const sql=readFileSync(new URL('../database/garment_secure_intake_v1.sql',import.meta.url),'utf8');
  assert.match(sql,/CREATE TABLE public\.garment_factories/);
  assert.match(sql,/CREATE TABLE public\.garment_staff/);
  assert.match(sql,/CREATE TABLE public\.garment_intake_orders/);
  assert.match(sql,/ALTER TABLE public\.garment_intake_orders FORCE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON public\.garment_factories,public\.garment_staff,public\.garment_intake_orders FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/GRANT SELECT,INSERT ON public\.garment_intake_orders TO authenticated/);
  assert.match(sql,/s\.factory_id=garment_intake_orders\.factory_id/);
  assert.doesNotMatch(sql,/s\.factory_id=factory_id/);
  assert.doesNotMatch(sql,/GRANT UPDATE|GRANT DELETE/);
});
test('cloud intake UI is clearly distinct from local simulation and linked from navigation',()=>{
  const code=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.match(code,/طلبات العملاء السحابية/);
  assert.match(code,/cloudIntakePage/);
  assert.match(code,/cloudCreateIntakeOrder/);
  assert.match(code,/if\(db\.demoMode\)throw Error/);
});
