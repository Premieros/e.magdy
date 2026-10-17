/* Human-readable accounting screen. UI only: no accounting or database writes here. */
import { ACCOUNT_KINDS, EXPENSE_CATEGORIES, accountingSummary } from './accounting.mjs';
import { suppliersSummary } from './suppliers.mjs';
import { supplierPicker } from './suppliers-ui.mjs';
export function accountingPageMarkup(db,{esc,heading,btn,metric,table,td,empty,cur}){
  const data=accountingSummary(db),suppliers=suppliersSummary(db);
  const history=data.entries.length?table(['التاريخ','العملية','البيان','داخل','خارج'],data.entries.slice(0,150).map(row=>{
    const kind=ACCOUNT_KINDS[row.kind],out=kind.direction==='out';
    return '<tr>'+td(esc(row.date))+td(esc(kind.label))
      +td(esc(row.customer||(row.supplierId?(db.suppliers||[]).find(s=>s.id===row.supplierId)?.name:'')||row.category||row.note||'—')+(row.note&&(row.customer||row.supplierId||row.category)?'<small class="ac-note">'+esc(row.note)+'</small>':''))
      +td(out?'—':'<b class="good">'+cur(row.amount)+'</b>')
      +td(out?'<b class="bad">'+cur(row.amount)+'</b>':'—')+'</tr>';
  }).join('')):empty('لا توجد حركات مالية','سجل تحصيلًا من عميل أو مصروفًا لبدء المتابعة.');
  const customers=data.customerBalances.length?table(['العميل','بضاعة تم تسليمها','تم تحصيله','المتبقي'],data.customerBalances.slice(0,100).map(row=>
    '<tr>'+td(esc(row.name))+td(cur(row.sales))+td(cur(row.paid))+td(row.balance>0?'<b class="bad">'+cur(row.balance)+'</b>':
    row.balance<0?'<b class="good">دفعة مقدمة '+cur(-row.balance)+'</b>':'تم السداد')+'</tr>').join('')):
    empty('لا توجد أرصدة عملاء','ستظهر بعد تسجيل تسليمات وتحويلات مالية مرتبطة بالعملاء.');
  const expenseCats=db.financeEntries.filter(x=>x.kind==='operating-expense').reduce((m,x)=>{
    m.set(x.category,(m.get(x.category)||0)+x.amount);return m;
  },new Map());
  const expenseList=[...expenseCats.entries()].sort((a,b)=>b[1]-a[1]).map(([category,value])=>
    '<div class="ac-expense-row"><strong>'+esc(category)+'</strong><b>'+cur(value)+'</b></div>').join('')
    ||'<p class="notes">لا توجد مصروفات إدارية مسجلة.</p>';
  const scale=Math.max(1,data.inflow,data.outflow);
  const cashBars=[['إجمالي المبالغ الداخلة',data.inflow,'in'],['إجمالي المبالغ الخارجة',data.outflow,'out']].map(([label,value,type])=>
    '<div class="ac-cash-row"><div><b>'+label+'</b><span>'+cur(value)+'</span></div><div class="ac-track"><span class="ac-fill ac-fill-'+type+'" style="width:'+(value/scale*100).toFixed(2)+'%"></span></div></div>').join('');
  return heading('الحسابات','متابعة سهلة للمبيعات الفعلية، التحصيلات، المدفوعات والربح التقديري.',btn('＋ تسجيل حركة مالية','new-finance','','primary'))
    +'<section class="ac-hero"><div><small>WHITE TEX · الحسابات</small><p>البيع يُحسب عند التسليم، والتحصيل يُسجَّل عند استلام المال فعلًا.</p></div><span aria-hidden="true">ج.م</span></section>'
    +'<div class="ac-metrics">'
    +metric('قيمة مبيعات تم تسليمها',cur(data.revenue),'بضاعة خرجت للعملاء')
    +metric('مبالغ محصّلة من العملاء',cur(data.receipts),'حركات قبض مدخلة فعليًا')
    +metric('متبقٍ عند العملاء',cur(data.receivables),'بعد خصم المبالغ المحصّلة')
    +metric('تكلفة البضاعة المسلّمة',data.costOfSales===null?'بيانات التكلفة ناقصة':cur(data.costOfSales),'وفق متوسط تكلفة تصنيع المخزون')
    +metric('مصروفات إدارية',cur(data.expenses),'المصروفات التي أدخلتها')
    +metric('الربح التقديري',data.netProfit===null?'لا تتوفر تكلفة كافية':cur(data.netProfit),'المبيعات ناقص التكلفة والمصروفات الإدارية')
    +'</div><div class="ac-grid"><section class="card"><h3>حركة الصندوق</h3><p class="sub">كل المبالغ المسجلة كتحصيل أو دفع</p>'
    +'<div class="ac-cash-summary"><b>صافي الحركات: '+cur(data.cashMovement)+'</b><span>الداخل '+cur(data.inflow)+' / الخارج '+cur(data.outflow)+'</span></div>'
    +cashBars+'<p class="ac-hint">هذا صافي الحركات المسجلة فقط، وليس رصيد البنك أو الخزينة الحقيقي إلا بعد تسجيل جميع الحركات والرصيد الافتتاحي.</p></section>'
    +'<section class="card"><h3>المصروفات الإدارية</h3><p class="sub">تفصيل المصروفات حسب نوعها</p>'+expenseList
    +'<p class="ac-hint">سداد الموردين وأجور التصنيع يُسجل كدفع نقدي دون احتسابه مصروفًا إداريًا إضافيًا، منعًا لتكرار التكلفة.</p></section></div>'
    +'<section class="card"><h3>أرصدة العملاء</h3><p class="sub">المبالغ المستحقة مقابل البضاعة التي سُلِّمت فعلًا</p>'+customers+'</section>'
    +'<section class="card"><div class="ac-list-title"><h3>مستحقات الموردين</h3>'+btn('إدارة الموردين','nav','suppliers')+'</div>'
    +(suppliers.entries.length?table(['المورد','التوريدات','المدفوعات','المتبقي'],suppliers.entries.map(s=>'<tr>'+td(esc(s.name))+td(cur(s.purchases))+td(cur(s.payments))
      +td(s.balance>0?'<strong class="bad">'+cur(s.balance)+'</strong>':s.balance<0?'دفعة مقدمة '+cur(-s.balance):'—')+'</tr>').join('')):
      '<p class="notes">أضف موردين واربطهم باستلامات الخامات والسداد، لتظهر المستحقات هنا.</p>')+'</section>'
    +'<section class="card"><div class="ac-list-title"><h3>سجل الحركات المالية</h3>'+btn('＋ حركة جديدة','new-finance','','primary')+'</div>'+history+'</section>'
    +'<p class="tips">الربح هنا **تقديري** بحسب متوسط تكلفة استلام الملابس الجاهزة، وليس قائمة مالية معتمدة أو إقرارًا ضريبيًا. بيانات الحسابات محلية في هذا المتصفح وتدخل ضمن النسخ الاحتياطي اليدوي فقط.</p>';
}
export function financeEntryForm(db,{esc,inp,sel},preferredSupplierId=''){
  const date=new Date(),today=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  const customers=[...new Set([...(db.wholesaleOrders||[]).map(x=>x.customer),...(db.finishedDispatches||[]).map(x=>x.customer)])].filter(Boolean);
  return '<p class="tips">اختر نوع العملية والمبلغ الفعلي. تسليم البضاعة يُسجل كمبيعات تلقائيًا فلا تسجله مرة ثانية.</p>'
    +'<div class="form-grid"><label class="field">نوع الحركة<select name="kind" required>'
    +Object.entries(ACCOUNT_KINDS).map(([key,value])=>'<option value="'+esc(key)+'" '+(key===(preferredSupplierId?'supplier-payment':'customer-receipt')?'selected':'')+'>'+esc(value.label)+'</option>').join('')
    +'</select></label>'
    +inp('المبلغ بالجنيه','amount','number','','required min="0.01" max="1000000000" step="0.01"')
    +inp('تاريخ العملية','date','date',today,'required')
    +'<label class="field">اسم العميل (للتحصيل)<input type="text" name="customer" list="accounting-customers" maxlength="120" placeholder="نفس الاسم الموجود في تسليم البضاعة">'
    +'<datalist id="accounting-customers">'+customers.map(x=>'<option value="'+esc(x)+'"></option>').join('')+'</datalist></label>'
    +supplierPicker(db,esc,{label:'المورد عند سداد مستحقاته (اختياري)',selected:preferredSupplierId})
    +'<label class="field">نوع المصروف (للمصروفات فقط)<select name="category"><option value="">غير مطلوب لباقي العمليات</option>'
    +EXPENSE_CATEGORIES.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('')+'</select></label>'
    +inp('ملاحظة (اختياري)','note','text','','maxlength="200"')+'</div>'
    +'<p class="notes">سداد مورد أو أجور تصنيع يخصم من حركة الصندوق فقط، ولا يُضاف مرة ثانية إلى تكلفة البضاعة أو الأرباح.</p>';
}
