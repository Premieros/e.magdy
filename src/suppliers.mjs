/* White tex supplier directory.
 * Supplier purchases are associated with actual stock receipts in the ledger,
 * while supplier payments are cash movements in financeEntries.
 * Never treat a stock issue or a cash payment as a second purchase.
 */
const clean=x=>String(x??'').trim();
const uniqueId=()=>globalThis.crypto?.randomUUID?.()||'SUP-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const money=n=>Math.round((n+Number.EPSILON)*100)/100;
const items=(db,key)=>Array.isArray(db?.[key])?db[key]:[];
export const SUPPLIER_TYPES=Object.freeze(['أقمشة','إكسسوارات','خيوط','طباعة','تعبئة وتغليف','مستلزمات أخرى']);
export function ensureSupplierState(db){
  if(db.suppliers===undefined)db.suppliers=[];
  if(!Array.isArray(db.suppliers))throw Error('بيانات الموردين غير متوافقة');
  return db;
}
export function validateSupplierState(db){
  ensureSupplierState(db);
  if(db.suppliers.length>2000)throw Error('الحد الأقصى للموردين 2000');
  const ids=new Set(),names=new Set();
  for(const s of db.suppliers){
    if(!s||typeof s!=='object'||typeof s.id!=='string'||!s.id||ids.has(s.id)
      ||typeof s.name!=='string'||!s.name.trim()||s.name.length>100
      ||names.has(s.name.trim().toLowerCase())
      ||typeof s.phone!=='string'||s.phone.length>30
      ||typeof s.contact!=='string'||s.contact.length>100
      ||typeof s.address!=='string'||s.address.length>250
      ||typeof s.category!=='string'||!SUPPLIER_TYPES.includes(s.category)
      ||typeof s.notes!=='string'||s.notes.length>350||typeof s.active!=='boolean'
      ||typeof s.createdAt!=='string')throw Error('بيانات مورد غير صحيحة أو مكررة');
    ids.add(s.id);names.add(s.name.trim().toLowerCase());
  }
  for(const r of items(db,'ledger')){
    if(r.supplierId!==undefined && r.supplierId!==null &&
      (r.kind!=='receive'||typeof r.supplierId!=='string'||!ids.has(r.supplierId)))
      throw Error('مورد غير صالح في استلام المخزون');
  }
  for(const r of items(db,'fabricRolls')){
    if(r.supplierId!==undefined&&r.supplierId!==null&&
      (typeof r.supplierId!=='string'||!ids.has(r.supplierId)))
      throw Error('مورد غير صالح في استلام رول القماش');
  }
  for(const r of items(db,'financeEntries')){
    if(r.supplierId!==undefined&&r.supplierId!==null&&
      (r.kind!=='supplier-payment'||typeof r.supplierId!=='string'||!ids.has(r.supplierId)))
      throw Error('مورد غير صالح في حركة السداد');
  }
  return db;
}
export function chooseSupplier(db,supplierId){
  const id=clean(supplierId);
  if(!id)return null;
  const supplier=items(db,'suppliers').find(s=>s.id===id);
  if(!supplier||!supplier.active)throw Error('اختر موردًا نشطًا');
  return supplier;
}
const required=(form,key,label,max)=>{
  const val=clean(form.get(key));
  if(!val||val.length>max)throw Error(label+' مطلوب (حتى '+max+' حرف)');
  return val;
};
export function saveSupplier(db,form,originalId=''){
  ensureSupplierState(db);
  const name=required(form,'name','اسم المورد',100);
  const category=clean(form.get('category'))||'مستلزمات أخرى';
  if(!SUPPLIER_TYPES.includes(category))throw Error('نوع المورد غير صحيح');
  const phone=clean(form.get('phone')),contact=clean(form.get('contact'));
  const address=clean(form.get('address')),notes=clean(form.get('notes'));
  if(phone.length>30||contact.length>100||address.length>250||notes.length>350)
    throw Error('بيانات التواصل أو الملاحظات طويلة جدًا');
  if(phone&&!/^[+0-9 ()-]{6,30}$/.test(phone))throw Error('رقم الهاتف غير صحيح');
  if(db.suppliers.some(s=>s.id!==originalId&&s.name.trim().toLowerCase()===name.toLowerCase()))
    throw Error('اسم المورد موجود بالفعل');
  const old=originalId?db.suppliers.find(s=>s.id===originalId):null;
  if(originalId&&!old)throw Error('المورد غير موجود');
  const now=new Date().toISOString();
  if(old)Object.assign(old,{name,phone,contact,address,category,notes,updatedAt:now});
  else db.suppliers.unshift({id:uniqueId(),name,phone,contact,address,category,notes,active:true,createdAt:now});
  if(Array.isArray(db.audit))db.audit.unshift({id:uniqueId(),at:now,message:(old?'تحديث بيانات المورد ':'إضافة مورد ')+name});
  return old||db.suppliers[0];
}
export function toggleSupplier(db,id){
  ensureSupplierState(db);
  const supplier=db.suppliers.find(s=>s.id===id);
  if(!supplier)throw Error('المورد غير موجود');
  supplier.active=!supplier.active;supplier.updatedAt=new Date().toISOString();
  if(Array.isArray(db.audit))db.audit.unshift({id:uniqueId(),at:supplier.updatedAt,
    message:(supplier.active?'تفعيل المورد ':'إيقاف المورد ')+supplier.name});
  return supplier;
}
export function suppliersSummary(db){
  const suppliers=items(db,'suppliers'),byId=new Map(suppliers.map(s=>[s.id,{
    ...s,purchases:0,payments:0,receipts:0,lastReceipt:null
  }]));
  let unassignedReceipts=0,unassignedPayments=0;
  for(const receipt of items(db,'ledger')){
    if(receipt.kind!=='receive'||!(Number(receipt.qty)>0))continue;
    const sum=money(Number(receipt.qty)*Number(receipt.cost||0));
    if(!Number.isFinite(sum)||sum<0)continue;
    const found=byId.get(receipt.supplierId);
    if(!found){unassignedReceipts++;continue;}
    found.purchases=money(found.purchases+sum);found.receipts++;
    if(!found.lastReceipt||receipt.at>found.lastReceipt)found.lastReceipt=receipt.at;
  }
  for(const payment of items(db,'financeEntries')){
    if(payment.kind!=='supplier-payment'||!(Number(payment.amount)>0))continue;
    const found=byId.get(payment.supplierId);
    if(!found){unassignedPayments++;continue;}
    found.payments=money(found.payments+Number(payment.amount));
  }
  const entries=[...byId.values()].map(s=>({...s,balance:money(s.purchases-s.payments)}))
    .sort((a,b)=>b.balance-a.balance||a.name.localeCompare(b.name,'ar'));
  return {
    entries,active:suppliers.filter(s=>s.active).length,
    purchases:money(entries.reduce((v,s)=>v+s.purchases,0)),
    payments:money(entries.reduce((v,s)=>v+s.payments,0)),
    payable:money(entries.reduce((v,s)=>v+Math.max(0,s.balance),0)),
    advancePayments:money(entries.reduce((v,s)=>v+Math.max(0,-s.balance),0)),
    unassignedReceipts,unassignedPayments
  };
}
