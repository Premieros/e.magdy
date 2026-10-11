/* Validated, factory-scoped *cloud* intake order fields.
 * Distinct from offline production and wholesale order simulations.
 */
const t=value=>String(value??'').trim();
const qty=value=>{
  if(!/^[1-9]\d{0,6}$/.test(value))throw Error('الكمية يجب أن تكون عددًا صحيحًا من 1 إلى 1000000');
  return Number(value);
};
const money=value=>{
  if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(value))throw Error('السعر يجب أن يكون رقمًا موجبًا أو صفرًا، بدقتين عشريتين');
  return Number(value);
};
export function parseIntakeLines(text){
  const rows=t(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!rows.length || rows.length>50)throw Error('اكتب من 1 إلى 50 صنفًا');
  const lines=rows.map((line,i)=>{
    const parts=line.split('|').map(v=>v.trim());
    if(parts.length!==5)throw Error('السطر '+(i+1)+': المطلوب SKU | المقاس | اللون | الكمية | السعر');
    const [sku,size,color,units,unitPrice]=parts;
    if(!sku||sku.length>80||size.length>40||color.length>60)throw Error('السطر '+(i+1)+': بيانات الصنف أو المقاس أو اللون غير صالحة');
    return {sku,size,color,qty:qty(units),unitPrice:money(unitPrice)};
  });
  return lines;
}
export function buildIntakeOrder(form){
  const customer_name=t(form.get('customerName'));
  const customer_contact=t(form.get('customerContact'));
  const notes=t(form.get('notes'));
  if(customer_name.length<2||customer_name.length>120)throw Error('اسم العميل يجب أن يكون من 2 إلى 120 حرفًا');
  if(customer_contact.length>160)throw Error('بيانات التواصل طويلة جدًا');
  if(notes.length>1000)throw Error('الملاحظات طويلة جدًا');
  const lines=parseIntakeLines(form.get('linesRaw'));
  return {customer_name,customer_contact,notes,lines};
}
export function intakeOrderTotal(order){
  const lines=order?.lines||[];
  const quantity=lines.reduce((sum,l)=>sum+l.qty,0);
  const amount=lines.reduce((sum,l)=>sum+l.qty*l.unitPrice,0);
  return {quantity,amount:Math.round((amount+Number.EPSILON)*100)/100};
}
