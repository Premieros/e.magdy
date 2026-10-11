/* Factory planning add-on: operates only on the existing offline draft.
 * A multi-SKU lot groups individual work orders; inventory is still issued per work order.
 */
const now=()=>new Date().toISOString();
const makeId=()=>globalThis.crypto?.randomUUID?.() ?? ('d-'+Date.now()+'-'+Math.random().toString(36).slice(2));
const name=value=>String(value ?? '').trim();
const asInt=(value,label,allowZero=false)=>{
  const str=name(value);
  if(!/^\d+$/.test(str)) throw Error(label+' يجب أن يكون عددًا صحيحًا');
  const n=Number(str);
  if(!Number.isSafeInteger(n)||n>(allowZero?100000:100000)||(!allowZero&&n===0))throw Error(label+' خارج الحدود المسموحة');
  return n;
};
export function createProductionMatrix(db,form) {
  const s=db.styles.find(x=>x.id===form.get('styleId'));
  if(!s)throw Error('اختر موديلًا صحيحًا');
  if(!s.bom?.length)throw Error('يجب تجهيز مكونات BOM للموديل قبل التخطيط');
  const selections=[];
  let total=0;
  for(const v of s.variants) {
    const raw=form.get('matrix_'+v.id);
    const qty=raw==null||name(raw)===''?0:asInt(raw,'كمية '+v.size+' / '+v.color,true);
    if(qty>0) {
      total+=qty;
      if(total>100000)throw Error('الحد الأقصى لإجمالي الدفعة 100000 قطعة');
      selections.push({variant:v,qty});
    }
  }
  if(!selections.length)throw Error('أدخل كمية لمقاس أو لون واحد على الأقل');
  const customer=name(form.get('customer')).slice(0,120);
  const due=name(form.get('due'));
  if(due && !/^\d{4}-\d{2}-\d{2}$/.test(due))throw Error('موعد التسليم غير صالح');
  const uid=makeId(), batchRef='LOT-'+now().slice(0,10).replaceAll('-','')+'-'+uid.slice(0,6).toUpperCase();
  const at=now();
  // All selections are validated before changing db, so a bad matrix cannot create half a lot.
  const newOrders=selections.map(({variant,qty})=>{
    const oid=makeId();
    return {id:oid,ref:'WO-'+at.slice(0,10).replaceAll('-','')+'-'+oid.slice(0,6).toUpperCase(),
      batchId:uid,batchRef,styleId:s.id,variantId:variant.id,qty,customer,due,status:'planned',
      materialCost:0,labor:0,overhead:0,good:0,reject:0,
      history:[{at,stage:'planned'}],used:[]};
  });
  db.orders.unshift(...newOrders);
  db.audit.unshift({id:makeId(),at,message:'إنشاء دفعة '+batchRef+' تشمل '+selections.length+' متغير و'+total+' قطعة'});
  return {batchId:uid,batchRef,orders:newOrders,total};
}
export function productionBatches(db) {
  const found=new Map();
  for(const o of db.orders) {
    if(!o.batchId)continue;
    let b=found.get(o.batchId);
    if(!b){
      b={id:o.batchId,ref:o.batchRef||'دفعة قديمة',styleId:o.styleId,
        customer:o.customer||'',due:o.due||'',qty:0,completed:0,planned:0,
        orders:[],good:0,reject:0};
      found.set(o.batchId,b);
    }
    b.qty+=o.qty;
    b.orders.push(o);
    if(o.status==='completed')b.completed+=1;
    if(o.status==='planned')b.planned+=1;
    b.good+=o.good||0;b.reject+=o.reject||0;
  }
  return [...found.values()];
}
export function cuttingBundleStats(db,orderId) {
  const rows=(db.cuttingBundles||[]).filter(x=>x.orderId===orderId);
  return {rows,total:rows.reduce((n,x)=>n+x.qty,0)};
}
export function addCuttingBundle(db,form) {
  if(!Array.isArray(db.cuttingBundles))db.cuttingBundles=[];
  const order=db.orders.find(x=>x.id===form.get('orderId'));
  if(!order||order.status!=='planned')throw Error('تسجيل حزم القص متاح قبل بدء القص فقط');
  const bundleNo=name(form.get('bundleNo')).toUpperCase();
  if(!bundleNo||bundleNo.length>50)throw Error('رقم حزمة القص مطلوب وبحد أقصى 50 حرفًا');
  const qty=asInt(form.get('quantity'),'كمية حزمة القص');
  if(db.cuttingBundles.some(x=>x.orderId===order.id&&x.bundleNo===bundleNo))
    throw Error('رقم حزمة القص مستخدم في هذا الأمر');
  const totals=cuttingBundleStats(db,order.id);
  if(totals.total+qty>order.qty)throw Error('إجمالي حزم القص يتجاوز كمية الأمر');
  const row={id:makeId(),orderId:order.id,variantId:order.variantId,bundleNo,qty,
    notes:name(form.get('notes')).slice(0,250),at:now()};
  db.cuttingBundles.unshift(row);
  db.audit.unshift({id:makeId(),at:row.at,message:'تسجيل حزمة القص '+bundleNo+' للأمر '+order.ref+' ('+qty+' قطعة)'});
  return row;
}
export function requireCuttingBundleBalance(db,order){
  if(order.status!=='planned')return;
  const summary=cuttingBundleStats(db,order.id);
  // Existing orders and users who do not adopt bundle tracking may use the legacy workflow.
  if(summary.rows.length && summary.total!==order.qty)
    throw Error('يجب مطابقة إجمالي حزم القص مع كمية الأمر: '+summary.total+' من '+order.qty);
}
