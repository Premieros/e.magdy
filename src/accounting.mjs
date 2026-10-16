/* White tex accounting overview — browser-local, no change to Supabase.
 * Dispatching finished goods recognizes a sale, NOT cash collection.
 * Supplier payments are cash movements, NOT purchases/expenses again.
 * Profit is an estimate based on receipt average costs, not certified accounts.
 */
const uuid=()=>globalThis.crypto?.randomUUID?.()||'ACC-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const rows=(db,key)=>Array.isArray(db?.[key])?db[key]:[];
const amount=n=>Math.round((n+Number.EPSILON)*100)/100;
const money=n=>Number.isFinite(n)?amount(n):0;
const text=n=>String(n??'').trim();
export const ACCOUNT_KINDS=Object.freeze({
  'customer-receipt':{label:'تحصيل من عميل',direction:'in',income:false},
  'owner-capital':{label:'إيداع أو رصيد افتتاحي',direction:'in',income:false},
  'supplier-payment':{label:'سداد لمورد',direction:'out',income:false},
  'wages-payment':{label:'سداد أجور إنتاج',direction:'out',income:false},
  'operating-expense':{label:'مصروف إداري أو تشغيلي',direction:'out',income:true},
  'owner-withdrawal':{label:'مسحوبات صاحب الشركة',direction:'out',income:false}
});
export const EXPENSE_CATEGORIES=Object.freeze(['إيجار','كهرباء ومياه','نقل وشحن','تسويق','إدارة ومكتب','صيانة','مصروفات أخرى']);
export function ensureAccountingState(db){
  if(db.financeEntries===undefined)db.financeEntries=[];
  if(!Array.isArray(db.financeEntries))throw Error('سجل الحسابات غير متوافق مع هذه النسخة');
  return db;
}
export function validateAccountingState(db){
  ensureAccountingState(db);
  const ids=new Set();
  for(const entry of db.financeEntries){
    if(!entry||typeof entry!=='object'||typeof entry.id!=='string'||!entry.id||ids.has(entry.id)||
      !Object.hasOwn(ACCOUNT_KINDS,entry.kind)||!Number.isFinite(entry.amount)||
      entry.amount<=0||Math.round(entry.amount*100)!==entry.amount*100&&
      Math.abs(entry.amount*100-Math.round(entry.amount*100))>1e-7||
      typeof entry.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)||
      !validDay(entry.date)||typeof entry.note!=='string'||
      typeof entry.customer!=='string'||typeof entry.category!=='string'||
      entry.note.length>200||entry.customer.length>120||
      (entry.kind==='operating-expense'&&!EXPENSE_CATEGORIES.includes(entry.category)))
      throw Error('سجل الحسابات يحتوي على حركة غير صحيحة أو مكررة');
    ids.add(entry.id);
  }
  return db;
}
function validDay(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [y,m,d]=value.split('-').map(Number);
  const date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}
export function recordFinanceEntry(db,form){
  ensureAccountingState(db);
  const kind=text(form.get('kind')),definition=ACCOUNT_KINDS[kind];
  if(!definition)throw Error('اختر نوع حركة صحيحًا');
  const raw=text(form.get('amount'));
  if(!/^\d{1,10}(?:\.\d{1,2})?$/.test(raw))throw Error('المبلغ مطلوب ويقبل رقمين بعد العلامة العشرية');
  const value=Number(raw);
  if(!Number.isSafeInteger(Math.round(value*100))||value<=0||value>1000000000)
    throw Error('المبلغ غير صالح');
  const date=text(form.get('date'));
  if(!validDay(date))throw Error('تاريخ الحركة غير صحيح');
  const customer=text(form.get('customer'));
  if(kind==='customer-receipt'&&!customer)throw Error('اختر العميل الذي سدد المبلغ');
  if(customer.length>120)throw Error('اسم العميل طويل جدًا');
  const category=kind==='operating-expense'?text(form.get('category')):'';
  if(kind==='operating-expense'&&!EXPENSE_CATEGORIES.includes(category))
    throw Error('اختر نوع المصروف');
  const note=text(form.get('note'));
  if(note.length>200)throw Error('الملاحظة أطول من المسموح');
  const entry={id:uuid(),kind,amount:amount(value),date,customer,category,note,createdAt:new Date().toISOString()};
  db.financeEntries.unshift(entry);
  if(Array.isArray(db.audit))
    db.audit.unshift({id:uuid(),at:entry.createdAt,message:'حركة حسابات: '+definition.label+' بقيمة '+entry.amount+' جنيه'});
  return entry;
}
const dayOf=value=>{
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
};
function averageCostByVariant(db){
  const map=new Map();
  for(const receipt of rows(db,'finished')){
    const q=Number(receipt.qty),c=Number(receipt.unitCost);
    if(!receipt.variantId||!Number.isFinite(q)||q<=0||!Number.isFinite(c)||c<0)continue;
    const r=map.get(receipt.variantId)||{qty:0,cost:0};
    r.qty+=q;r.cost+=q*c;map.set(receipt.variantId,r);
  }
  return map;
}
export function accountingSummary(db){
  const entries=rows(db,'financeEntries');
  const total=kind=>money(entries.filter(row=>row.kind===kind)
    .reduce((sum,row)=>sum+row.amount,0));
  const inflow=money(entries.reduce((sum,row)=>sum+
    (ACCOUNT_KINDS[row.kind]?.direction==='in'?row.amount:0),0));
  const outflow=money(entries.reduce((sum,row)=>sum+
    (ACCOUNT_KINDS[row.kind]?.direction==='out'?row.amount:0),0));
  const sales=rows(db,'finishedDispatches');
  const inventory=averageCostByVariant(db);
  let revenue=0,cost=0,unpriced=0,deliveredQty=0;
  const customers=new Map();
  for(const dispatch of sales){
    let dispatchRevenue=0;
    for(const line of Array.isArray(dispatch.lines)?dispatch.lines:[]){
      const q=Number(line.qty),p=Number(line.unitPrice);
      if(!Number.isFinite(q)||q<=0||!Number.isFinite(p)||p<0)continue;
      deliveredQty+=q;
      const value=q*p;revenue+=value;dispatchRevenue+=value;
      const product=inventory.get(line.variantId);
      if(product?.qty>0)cost+=q*product.cost/product.qty;
      else unpriced+=q;
    }
    const name=text(dispatch.customer)||'عميل غير محدد';
    const customer=customers.get(name)||{name,sales:0,paid:0};
    customer.sales+=dispatchRevenue;customers.set(name,customer);
  }
  for(const entry of entries.filter(row=>row.kind==='customer-receipt')){
    const name=text(entry.customer);
    const customer=customers.get(name)||{name,sales:0,paid:0};
    customer.paid+=entry.amount;customers.set(name,customer);
  }
  const customerBalances=[...customers.values()].map(row=>({
    name:row.name,sales:money(row.sales),paid:money(row.paid),
    balance:money(row.sales-row.paid)
  })).sort((a,b)=>b.balance-a.balance||a.name.localeCompare(b.name,'ar'));
  const expenses=total('operating-expense'),costKnown=unpriced===0;
  const revenueRounded=money(revenue),costRounded=costKnown?money(cost):null;
  const grossProfit=costKnown?money(revenue-cost):null;
  const netProfit=costKnown?money(revenue-cost-expenses):null;
  return {
    revenue:revenueRounded,deliveredQty,costOfSales:costRounded,unpricedQty:unpriced,
    grossProfit,expenses,netProfit,
    receipts:total('customer-receipt'),supplierPayments:total('supplier-payment'),
    wagePayments:total('wages-payment'),outflow,inflow,cashMovement:money(inflow-outflow),
    customerBalances,receivables:money(customerBalances.reduce((s,r)=>s+Math.max(0,r.balance),0)),
    advanceCollections:money(customerBalances.reduce((s,r)=>s+Math.max(0,-r.balance),0)),
    costKnown, entries:entries.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt))
  };
}
