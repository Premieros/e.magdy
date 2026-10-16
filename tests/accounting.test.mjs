import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __test as g } from '../app.js';
import { buildNotifications } from '../src/notifications.mjs';
import { validateCloudSnapshot } from '../src/cloud-backup.mjs';
import { ensureAccountingState, validateAccountingState, recordFinanceEntry, accountingSummary } from '../src/accounting.mjs';
import { accountingPageMarkup, financeEntryForm } from '../src/accounting-ui.mjs';
import { readFileSync } from 'node:fs';

const f=values=>{const d=new FormData();for(const [key,value] of Object.entries(values))d.set(key,String(value));return d;};
function factory(){
  const db=g.fresh();
  g.newMaterial(db,f({code:'FAB1',name:'قماش',unit:'متر'}));
  g.receive(db,f({materialId:db.materials[0].id,quantity:100,unitCost:20}));
  g.newStyle(db,f({code:'SH01',name:'قميص',sizes:'M',colors:'أسود',price:100}));
  g.setBom(db,db.styles[0].id,f({['bom_'+db.materials[0].id]:2}));
  g.newOrder(db,f({styleId:db.styles[0].id,variantId:db.styles[0].variants[0].id,quantity:4}));
  return db;
}
function produce(db){
  const o=db.orders[0];
  while(o.status!=='quality')g.advance(db,o.id);
  g.quality(db,o.id,f({good:4,reject:0,labor:0,overhead:0}));
  while(o.status!=='completed')g.advance(db,o.id);
}
function sale(db,quantity=2){
  const s=db.styles[0],variant=s.variants[0];
  g.createWholesaleOrder(db,f({styleId:s.id,customer:'شركة البركة',['sell_'+variant.id]:quantity}));
  return db.wholesaleOrders[0];
}
function deliver(db,saleOrder,quantity=2){
  const variant=db.styles[0].variants[0];
  return g.dispatchWholesaleOrder(db,f({orderId:saleOrder.id,reference:'D-12',['ship_'+variant.id]:quantity}));
}
const tx=(kind,amount,extra={})=>f({kind,amount,date:'2026-10-17',...extra});
test('older backups acquire finance array without removing production or customers',()=>{
  const db=factory();delete db.financeEntries;
  ensureAccountingState(db);
  assert.deepEqual(db.financeEntries,[]);
  const loaded=validateCloudSnapshot(db);
  assert.deepEqual(loaded.financeEntries,[]);
  assert.equal(loaded.orders.length,1);
  assert.equal(loaded.materials[0].stock,100);
});
test('sales are recorded only on delivered goods; wholesale order alone is not revenue',()=>{
  const db=factory();produce(db);
  const s=sale(db,3);
  assert.equal(accountingSummary(db).revenue,0);
  assert.equal(accountingSummary(db).receipts,0);
  deliver(db,s,2);
  const summary=accountingSummary(db);
  assert.equal(summary.revenue,200);
  assert.equal(summary.deliveredQty,2);
  assert.equal(summary.costOfSales,80);
  assert.equal(summary.netProfit,120);
  assert.equal(summary.receivables,200);
});
test('customer receipts reduce debt and increase cash without doubling sales',()=>{
  const db=factory();produce(db);deliver(db,sale(db));
  const before=structuredClone(db);
  recordFinanceEntry(db,tx('customer-receipt',150,{customer:'شركة البركة'}));
  const data=accountingSummary(db);
  assert.equal(data.revenue,200);
  assert.equal(data.receipts,150);
  assert.equal(data.customerBalances[0].balance,50);
  assert.equal(data.receivables,50);
  assert.equal(data.inflow,150);
  assert.equal(data.cashMovement,150);
  assert.equal(data.netProfit,120);
  const events=buildNotifications(before,db);
  assert.ok(events.some(row=>row.type==='finance'&&row.title.includes('تحصيل')));
});
test('supplier payments and production wages affect cash, not cost of goods again',()=>{
  const db=factory();produce(db);deliver(db,sale(db));
  recordFinanceEntry(db,tx('supplier-payment',50));
  recordFinanceEntry(db,tx('wages-payment',20));
  recordFinanceEntry(db,tx('owner-capital',100));
  const result=accountingSummary(db);
  assert.equal(result.costOfSales,80);
  assert.equal(result.netProfit,120);
  assert.equal(result.supplierPayments,50);
  assert.equal(result.wagePayments,20);
  assert.equal(result.cashMovement,30);
});
test('operating expenses are deducted once and itemized clearly',()=>{
  const db=factory();produce(db);deliver(db,sale(db));
  recordFinanceEntry(db,tx('operating-expense',25,{category:'كهرباء ومياه',note:'فاتورة أكتوبر'}));
  assert.equal(accountingSummary(db).expenses,25);
  assert.equal(accountingSummary(db).netProfit,95);
  assert.equal(accountingSummary(db).outflow,25);
});
test('sales with missing actual product costs do not fabricate a precise profit',()=>{
  const db=g.fresh();
  db.finishedDispatches.push({customer:'شركة البركة',lines:[{variantId:'missing',qty:3,unitPrice:100}]});
  const data=accountingSummary(db);
  assert.equal(data.revenue,300);
  assert.equal(data.costOfSales,null);
  assert.equal(data.netProfit,null);
  assert.equal(data.unpricedQty,3);
});
test('invalid financial inputs fail atomically and snapshots reject corrupt ledger',()=>{
  const db=factory();
  for(const form of [
    tx('other',10),
    tx('customer-receipt',0,{customer:'شركة البركة'}),
    tx('customer-receipt',5),
    tx('supplier-payment',12.345),
    tx('operating-expense',10),
    tx('operating-expense',10,{category:'غير معروفة'}),
    tx('supplier-payment',10,{date:'2026-02-30'})
  ])assert.throws(()=>recordFinanceEntry(db,form));
  assert.equal(db.financeEntries.length,0);
  recordFinanceEntry(db,tx('owner-capital',100));
  const duplicate=structuredClone(db);
  duplicate.financeEntries.push({...duplicate.financeEntries[0]});
  assert.throws(()=>validateAccountingState(duplicate),/مكررة|صحيحة/);
  const invalid=structuredClone(db);
  invalid.financeEntries[0].amount=-2;
  assert.throws(()=>validateCloudSnapshot(invalid),/الحسابات/);
});
test('Arabic accounts page, input and Pages deployment are wired together',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(app,/accounting:accountingPage/);
  assert.match(app,/new-finance/);
  assert.match(app,/recordFinanceEntry\(d,f\)/);
  assert.match(app,/validateAccountingState\(value\)/);
  assert.match(pages,/src\/accounting\.mjs src\/accounting-ui\.mjs/);
  assert.match(css,/\.ac-metrics/);
  const ctx={
    esc:x=>String(x),heading:(a,b)=>a+b,btn:x=>x,metric:(a,b)=>a+b,
    table:(a,b)=>a.join(' ')+b,td:x=>x,empty:(a,b)=>a+b,cur:x=>x+' ج.م'
  };
  const html=accountingPageMarkup(factory(),ctx);
  assert.match(html,/الحسابات/);
  assert.match(html,/مبيعات/);
  const formHtml=financeEntryForm(factory(),{esc:ctx.esc,inp:(a,b)=>a+b,sel:(a,b)=>a+b});
  assert.match(formHtml,/نوع الحركة/);
  assert.match(formHtml,/المبلغ/);
});
