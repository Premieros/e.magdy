/* Arabic supplier pages — no codes required from users */
import {SUPPLIER_TYPES,suppliersSummary} from './suppliers.mjs';
export function supplierPage(db,{esc,heading,btn,metric,table,td,empty,cur,num}){
  const data=suppliersSummary(db);
  const rows=data.entries.map(s=>'<tr>'
    +td('<b>'+esc(s.name)+'</b>'+(s.contact?'<small class="sup-detail">'+esc(s.contact)+'</small>':''))
    +td(esc(s.category))
    +td(s.phone?'<a class="sup-phone" href="tel:'+esc(s.phone.replace(/[^0-9+]/g,''))+'">'+esc(s.phone)+'</a>':'—')
    +td('<span class="access-status '+(s.active?'access-on':'access-off')+'">'+(s.active?'نشط':'موقوف')+'</span>')
    +td(cur(s.purchases))
    +td(cur(s.payments))
    +td(s.balance>0?'<strong class="bad">'+cur(s.balance)+'</strong>':s.balance<0?'<strong class="good">دفعة مقدمة '+cur(-s.balance)+'</strong>':'—')
    +td('<div class="access-actions">'+btn('تعديل','edit-supplier',s.id)
      +btn('سداد','pay-supplier',s.id)
      +btn(s.active?'إيقاف':'تفعيل','toggle-supplier',s.id)+'</div>')+'</tr>').join('');
  const ledger=(db.ledger||[]).filter(row=>row.kind==='receive'&&row.supplierId)
    .map(row=>({at:row.at,supplierId:row.supplierId,kind:'receipt',value:row.qty*row.cost,
      item:(db.materials||[]).find(m=>m.id===row.materialId)?.name||'خامة',qty:row.qty,unit:(db.materials||[]).find(m=>m.id===row.materialId)?.unit||''}));
  const payments=(db.financeEntries||[]).filter(row=>row.kind==='supplier-payment'&&row.supplierId)
    .map(row=>({at:row.createdAt||row.date,supplierId:row.supplierId,kind:'payment',value:row.amount,item:row.note||'سداد نقدي'}));
  const activities=[...ledger,...payments].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,40);
  const movements=activities.length
    ?table(['التاريخ','المورد','الحركة','التفاصيل','القيمة'],activities.map(row=>{
      const supplier=(db.suppliers||[]).find(s=>s.id===row.supplierId);
      const date=row.at?new Date(row.at):null;
      const formatted=date&&!Number.isNaN(date.getTime())?date.toLocaleDateString('ar-EG'):'—';
      return '<tr>'+td(esc(formatted))+td(esc(supplier?.name||'—'))
        +td(row.kind==='receipt'?'<span class="pill green">توريد خامات</span>':'<span class="pill gold">سداد مورد</span>')
        +td(esc(row.item)+(row.kind==='receipt'?'<small class="sup-detail">'+num(row.qty)+' '+esc(row.unit)+'</small>':''))
        +td('<strong>'+cur(row.value)+'</strong>')+'</tr>';
    }).join(''))
    :empty('لا توجد معاملات مرتبطة بالموردين','عند استلام خامة أو تسجيل سداد، اختر المورد لعرض العملية هنا.');
  const note=(data.unassignedReceipts||data.unassignedPayments)
    ?'<p class="sup-hint"><b>تنبيه:</b> '+num(data.unassignedReceipts)+' استلام و'+num(data.unassignedPayments)
      +' سداد بدون مورد محدد من السجلات القديمة أو غير المرتبطة. لا تدخل ضمن أرصدة الموردين أعلاه.</p>':'';
  return heading('الموردون','بيانات الموردين وحركة التوريد والسداد، دون أكواد أو خطوات معقدة.',
    btn('＋ إضافة مورد','new-supplier','','primary'))
    +'<div class="sup-hero"><div><small>WHITE TEX · الموردون</small><h2>كل توريداتك وحسابات الموردين</h2>'
    +'<p>سجل بيانات المورد مرة واحدة، ثم اختره عند استلام الخامات أو سداد المستحقات.</p></div>'
    +'<div class="sup-hero-icon" aria-hidden="true">▥</div></div>'
    +'<div class="sup-kpis">'
    +metric('الموردون النشطون',num(data.active),'موردون متاحون للاستلام')
    +metric('قيمة التوريدات',cur(data.purchases),'الاستلامات المرتبطة بمورد')
    +metric('مدفوعات الموردين',cur(data.payments),'المبالغ المسددة والمسجلة')
    +metric('مستحقات الموردين',cur(data.payable),'بعد خصم المدفوعات المرتبطة')
    +'</div>'
    +'<section class="card"><div class="sup-section-title"><div><h3>دليل الموردين</h3><p>الموردون المسجلون وحركة حساب كل مورد</p></div>'
    +btn('＋ إضافة مورد','new-supplier','','primary')+'</div>'
    +(rows?table(['المورد','التخصص','التواصل','الحالة','توريدات','مدفوعات','المتبقي',''],rows)
      :empty('لا يوجد موردون بعد','أضف أول مورد، ثم اربطه باستلام خامات أو سداد من الحسابات.'))
    +note+'</section>'
    +'<section class="card"><div class="sup-section-title"><div><h3>آخر معاملات الموردين</h3>'
    +'<p>توريدات فعلية وسداد مبالغ، دون ازدواج في الحسابات</p></div>'
    +btn('＋ استلام خامة','new-receipt')+'</div>'+movements+'</section>'
    +'<p class="tips">مستحقات الموردين = قيمة الخامات المستلمة من كل مورد ناقص المدفوعات المرتبطة به، وهي متابعة تشغيلية. لا تُحسب الاستلامات والمدفوعات القديمة غير المرتبطة بأي مورد حتى يتم ربطها بطريقة موثقة. لا يُحتسب صرف الخامات للإنتاج مشتريات جديدة.</p>';
}
export function supplierForm(db,esc,supplierId=''){
  const supplier=supplierId?(db.suppliers||[]).find(s=>s.id===supplierId):null;
  if(supplierId&&!supplier)throw Error('المورد غير موجود');
  const val=(key)=>esc(supplier?.[key]||'');
  return '<div class="form-grid">'
    +'<label class="field">اسم المورد<input name="name" maxlength="100" required value="'+val('name')+'" placeholder="اسم الشركة أو المورد"></label>'
    +'<label class="field">نوع التوريد<select name="category" required>'
    +SUPPLIER_TYPES.map(x=>'<option value="'+esc(x)+'" '+((supplier?.category||'مستلزمات أخرى')===x?'selected':'')+'>'+esc(x)+'</option>').join('')
    +'</select></label>'
    +'<label class="field">رقم الهاتف (اختياري)<input name="phone" type="tel" maxlength="30" value="'+val('phone')+'" placeholder="01xxxxxxxxx"></label>'
    +'<label class="field">الشخص المسؤول (اختياري)<input name="contact" maxlength="100" value="'+val('contact')+'" placeholder="اسم مندوب المورد"></label>'
    +'<label class="field">العنوان (اختياري)<input name="address" maxlength="250" value="'+val('address')+'" placeholder="مكان المورد"></label>'
    +'<label class="field">ملاحظات (اختياري)<input name="notes" maxlength="350" value="'+val('notes')+'" placeholder="شروط التوريد أو المواعيد"></label></div>'
    +'<p class="notes">يمكنك إيقاف المورد دون حذف تاريخه أو معاملات المخزون والحسابات المرتبطة به.</p>';
}
export function supplierPicker(db,esc,{label='المورد (اختياري)',selected=''}={}){
  const suppliers=(db.suppliers||[]).filter(s=>s.active||s.id===selected);
  return '<label class="field">'+esc(label)+'<select name="supplierId"><option value="">بدون ربط مورد</option>'
    +suppliers.map(s=>'<option value="'+esc(s.id)+'" '+(s.id===selected?'selected':'')+'>'+esc(s.name)+(s.active?'':' (موقوف)')+'</option>').join('')
    +'</select></label>';
}
