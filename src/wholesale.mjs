/* PremierOS Garments — offline wholesale sales and finished-goods dispatch.
 * Shipments are immutable stock movement records. No network sync or reservations.
 */
const id=()=>globalThis.crypto?.randomUUID?.() ?? 'd-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const now=()=>new Date().toISOString();
const txt=v=>String(v??'').trim();
const cents=value=>Math.round((value+Number.EPSILON)*100)/100;
const quantity=(raw,label,{zero=false}={})=>{
  const value=txt(raw);
  if(!/^\d+$/.test(value))throw Error(label+' يجب أن يكون عددًا صحيحًا');
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n>1000000||(!zero&&n===0))throw Error(label+' خارج الحدود المسموحة');
  return n;
};
export function ensureWholesaleState(db){
  for(const key of ['wholesaleOrders','finishedDispatches']){
    if(db[key]===undefined)db[key]=[];
    if(!Array.isArray(db[key]))throw Error('بيانات الجملة غير متوافقة: '+key);
  }
  return db;
}
export function availableFinishedStock(db,variantId){
  const received=(db.finished||[]).filter(x=>x.variantId===variantId).reduce((s,x)=>s+x.qty,0);
  const delivered=(db.finishedDispatches||[]).flatMap(x=>x.lines||[])
    .filter(x=>x.variantId===variantId).reduce((s,x)=>s+x.qty,0);
  return received-delivered;
}
export function wholesaleProgress(db,order){
  const sent=new Map();
  for(const dispatch of (db.finishedDispatches||[])){
    if(dispatch.orderId!==order.id)continue;
    for(const line of dispatch.lines)sent.set(line.variantId,(sent.get(line.variantId)||0)+line.qty);
  }
  const lines=order.lines.map(line=>({
    ...line,shipped:sent.get(line.variantId)||0,
    remaining:line.qty-(sent.get(line.variantId)||0)
  }));
  const ordered=lines.reduce((s,l)=>s+l.qty,0);
  const shipped=lines.reduce((s,l)=>s+l.shipped,0);
  return {lines,ordered,shipped,remaining:ordered-shipped,
    amount:cents(lines.reduce((s,l)=>s+l.qty*l.unitPrice,0)),
    shippedAmount:cents(lines.reduce((s,l)=>s+l.shipped*l.unitPrice,0)),
    status:shipped===0?'open':shipped===ordered?'fulfilled':'partial'};
}
export function createWholesaleOrder(db,form){
  ensureWholesaleState(db);
  const style=db.styles.find(x=>x.id===form.get('styleId'));
  if(!style)throw Error('اختر موديلًا صالحًا');
  const customer=txt(form.get('customer'));
  if(!customer||customer.length>120)throw Error('اسم العميل مطلوب (حتى 120 حرفًا)');
  const due=txt(form.get('due'));
  if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))throw Error('موعد التسليم غير صالح');
  const unitPrice=Number(style.sellingPrice);
  if(!Number.isFinite(unitPrice)||unitPrice<0)throw Error('سعر الموديل غير صالح');
  let total=0;
  const lines=[];
  for(const v of style.variants){
    const raw=form.get('sell_'+v.id);
    const q=raw==null||txt(raw)===''?0:quantity(raw,'كمية '+v.size+'/'+v.color,{zero:true});
    if(q>0){
      total+=q;
      if(total>1000000)throw Error('الحد الأقصى لطلب الجملة مليون قطعة');
      lines.push({variantId:v.id,sku:v.sku,size:v.size,color:v.color,qty:q,unitPrice:cents(unitPrice)});
    }
  }
  if(!lines.length)throw Error('أدخل كمية لمقاس أو لون واحد على الأقل');
  const uid=id();
  const order={id:uid,ref:'SO-'+now().slice(0,10).replaceAll('-','')+'-'+uid.slice(0,8).toUpperCase(),
    styleId:style.id,customer,due,createdAt:now(),lines};
  db.wholesaleOrders.unshift(order);
  db.audit.unshift({id:id(),at:now(),message:'إنشاء طلب جملة '+order.ref+' للعميل '+customer+' ('+total+' قطعة)'});
  return order;
}
export function dispatchWholesaleOrder(db,form){
  ensureWholesaleState(db);
  const order=db.wholesaleOrders.find(x=>x.id===form.get('orderId'));
  if(!order)throw Error('طلب الجملة غير موجود');
  const reference=txt(form.get('reference')).toUpperCase();
  if(!reference||reference.length>60)throw Error('مرجع التسليم مطلوب (حتى 60 حرفًا)');
  if(db.finishedDispatches.some(x=>x.reference===reference))
    throw Error('مرجع التسليم مستخدم من قبل؛ لا يمكن الصرف مرتين لنفس المرجع');
  const progress=wholesaleProgress(db,order);
  if(progress.remaining<=0)throw Error('طلب الجملة مكتمل التسليم');
  const issues=[];
  for(const line of progress.lines){
    const raw=form.get('ship_'+line.variantId);
    const qty=raw==null||txt(raw)===''?0:quantity(raw,'تسليم '+line.sku,{zero:true});
    if(qty===0)continue;
    if(qty>line.remaining)throw Error('الكمية تتجاوز المتبقي من طلب الجملة للصنف '+line.sku);
    const available=availableFinishedStock(db,line.variantId);
    if(qty>available)throw Error('مخزون التام غير كافٍ للصنف '+line.sku+': المتاح '+available);
    issues.push({variantId:line.variantId,qty,unitPrice:line.unitPrice});
  }
  if(!issues.length)throw Error('أدخل قطعة واحدة على الأقل للتسليم');
  // No stock/dispatch mutation occurs until every item has passed validation.
  const dispatch={id:id(),orderId:order.id,reference,at:now(),lines:issues,
    customer:order.customer};
  db.finishedDispatches.unshift(dispatch);
  db.audit.unshift({id:id(),at:dispatch.at,
    message:'تسليم طلب الجملة '+order.ref+' بإذن '+reference+' ('+issues.reduce((s,x)=>s+x.qty,0)+' قطعة)'});
  return dispatch;
}
export function wholesaleOverview(db){
  const orders=db.wholesaleOrders||[];
  const open=orders.filter(o=>wholesaleProgress(db,o).remaining>0).length;
  const delivered=(db.finishedDispatches||[]).flatMap(x=>x.lines||[]);
  return {orders:orders.length,open,delivered:delivered.reduce((s,x)=>s+x.qty,0),
    value:cents(delivered.reduce((s,x)=>s+x.qty*x.unitPrice,0))};
}


/* Validate imported/manual cloud snapshots before replacing local stock ledgers. */
export function validateWholesaleLedger(db){
  ensureWholesaleState(db);
  const received=new Map();
  for(const r of db.finished||[]){
    if(!r||!r.variantId||!Number.isSafeInteger(r.qty)||r.qty<=0)
      throw Error('إيصال إنتاج تام غير صالح في النسخة الاحتياطية');
    received.set(r.variantId,(received.get(r.variantId)||0)+r.qty);
  }
  const sales=new Map();
  for(const order of db.wholesaleOrders){
    if(!order||!order.id||!Array.isArray(order.lines)||!order.lines.length||sales.has(order.id))
      throw Error('طلب جملة غير صالح في النسخة الاحتياطية');
    const variants=new Set();
    for(const line of order.lines){
      if(!line||!line.variantId||variants.has(line.variantId)||!Number.isSafeInteger(line.qty)||line.qty<=0
        ||!Number.isFinite(line.unitPrice)||line.unitPrice<0)
        throw Error('سطر طلب جملة غير صالح في النسخة الاحتياطية');
      variants.add(line.variantId);
    }
    sales.set(order.id,order);
  }
  const references=new Set(),totalDelivered=new Map(),orderDelivered=new Map();
  for(const dispatch of db.finishedDispatches){
    if(!dispatch||!dispatch.id||!dispatch.orderId||!dispatch.reference
      ||references.has(dispatch.reference)||!Array.isArray(dispatch.lines)||!dispatch.lines.length)
      throw Error('إذن تسليم مكرر أو غير صالح في النسخة الاحتياطية');
    references.add(dispatch.reference);
    const order=sales.get(dispatch.orderId);
    if(!order)throw Error('إذن تسليم دون طلب جملة');
    const inDispatch=new Set();
    for(const line of dispatch.lines){
      if(!line||!line.variantId||inDispatch.has(line.variantId)
        ||!Number.isSafeInteger(line.qty)||line.qty<=0)
        throw Error('سطر تسليم غير صالح في النسخة الاحتياطية');
      inDispatch.add(line.variantId);
      const saleLine=order.lines.find(x=>x.variantId===line.variantId);
      if(!saleLine)throw Error('صنف غير موجود في طلب الجملة');
      const key=order.id+'|'+line.variantId;
      const shipped=(orderDelivered.get(key)||0)+line.qty;
      if(shipped>saleLine.qty)throw Error('تسليم يتجاوز طلب الجملة');
      orderDelivered.set(key,shipped);
      const total=(totalDelivered.get(line.variantId)||0)+line.qty;
      if(total>(received.get(line.variantId)||0))
        throw Error('إجمالي تسليمات الصنف يتجاوز مخزون التام');
      totalDelivered.set(line.variantId,total);
    }
  }
  return db;
}
