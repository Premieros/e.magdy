/* PremierOS Garments | independent, browser-local prototype | no remote database */
import { stages, labels, workStages, stageTargetQuantity, nextStageAction } from './src/workflow.mjs';
import { buildNotifications, newNotification, ensureNotifications, appendNotifications, unreadCount, notificationIcons, LOW_STOCK_LEVEL } from './src/notifications.mjs';
import { cloudIdentity, cloudLogin, cloudLogout, cloudSave, cloudLoad, validateCloudSnapshot, cloudFactoryList, cloudIntakeOrders, cloudCreateIntakeOrder } from './src/cloud-backup.mjs';
import { buildIntakeOrder, intakeOrderTotal } from './src/cloud-intake.mjs';
import { createProductionMatrix, productionBatches, addCuttingBundle, cuttingBundleStats, requireCuttingBundleBalance } from './src/production-planning.mjs';
import { ensureWholesaleState, createWholesaleOrder, dispatchWholesaleOrder, availableFinishedStock, wholesaleProgress, wholesaleOverview, validateWholesaleLedger } from './src/wholesale.mjs';
import { populateDemoData, isDemoEligible, demoCoverage } from './src/demo-data.mjs';
import { ensureFactoryState, addWorker, registerStageWork, pieceworkCost, stageProgress,
  checkStageBeforeAdvance, receiveFabricRoll, allocateFabricRolls } from './src/factory-ops.mjs';
const KEY='premieros-garments-local-v1';

const NAV_ICONS={
'⌂':'<rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/>',
'◈':'<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
'▤':'<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z"/><path d="m3 7.5 9 5 9-5"/><path d="M12 12.5V21"/>',
'◧':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M8 4v16M14 10v10"/>',
'♙':'<circle cx="12" cy="6.5" r="3.5"/><path d="M16 20H8a4 4 0 0 1-4-4c0-3.1 2.4-5 5.5-5h5c3.1 0 5.5 1.9 5.5 5a4 4 0 0 1-4 4Z"/>',
'▣':'<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 4.5h8M8 10h8M8 14h8M8 18h5"/>',
'◉':'<path d="m5 12 4 4L19 6"/><circle cx="12" cy="12" r="10"/>',
'▥':'<path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16"/><path d="M8 17v-5M12 17V8M16 17v-8M3 21h18"/>',
'▧':'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 14h3m3 0h3M8 18h9"/>',
'⚙':'<circle cx="12" cy="12" r="3"/><path d="M19 13v-2l-2-1-1-2 1-2-2-2-2 1h-2l-1-2H8L7 5H5L3 7l1 2-1 2-2 1v2l2 1 1 2-1 2 2 2 2-1h2l1 2h2l1-2h2l2 1 2-2-1-2 1-2Z"/>'
};
const navIcon=token=>'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(NAV_ICONS[token]||'')+'</svg>';

const fresh=()=>({version:1,styles:[],materials:[],orders:[],ledger:[],finished:[],audit:[],workers:[],workLogs:[],fabricRolls:[],cuttingBundles:[],wholesaleOrders:[],finishedDispatches:[],notifications:[]});
let db;
try{db=JSON.parse(localStorage.getItem(KEY)||'null')||fresh();if(db.version!==1)throw Error('نسخة غير متوافقة');ensureFactoryState(db);ensureWholesaleState(db);ensureNotifications(db);}
catch(e){db=fresh();}
let cloudFactoriesState=[],cloudIntakeState=[],cloudFactorySelected='',cloudIntakeMessage='';
let notificationCenterOpen=false;
let page=(typeof location!=='undefined'?location.hash:'#/dashboard'||'#/dashboard').replace('#/','')||'dashboard',detail=null,modal=null,search='';
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const id=()=>crypto.randomUUID();
const n=x=>Number(x||0);
const num=x=>n(x).toLocaleString('ar-EG',{maximumFractionDigits:2});
const cur=x=>num(x)+' ج.م';
const round=x=>Math.round((x+Number.EPSILON)*10000)/10000;
const price=x=>Math.round((x+Number.EPSILON)*100)/100;
const str=x=>String(x||'').trim();
const code=x=>str(x).toUpperCase().replace(/\s+/g,'-');
const positive=(x,t)=>{let v=Number(x);if(!Number.isFinite(v)||v<=0)throw Error(t+' يجب أن يكون أكبر من صفر');return v;};
const nonnegative=(x,t)=>{let v=Number(x);if(!Number.isFinite(v)||v<0)throw Error(t+' يجب ألا يكون سالبًا');return v;};
const required=(x,t)=>{let v=str(x);if(!v)throw Error(t+' مطلوب');return v;};
const list=x=>[...new Set(str(x).split(/[,،\n]/).map(y=>str(y)).filter(Boolean))];
const style=id=>db.styles.find(x=>x.id===id),mat=id=>db.materials.find(x=>x.id===id),order=id=>db.orders.find(x=>x.id===id);
const variant=o=>style(o.styleId)?.variants.find(x=>x.id===o.variantId);
const status=s=>'<span class="pill '+(s==='completed'?'green':['quality','presentation_quality'].includes(s)?'gold':s==='cancelled'?'red':'')+'">'+esc(labels[s])+'</span>';
const btn=(label,action,value='',kind='')=>'<button class="btn '+kind+'" data-act="'+action+'" data-id="'+esc(value)+'">'+label+'</button>';
const td=x=>'<td>'+x+'</td>';
const empty=(title,subtitle)=>'<div class="empty">✧<b>'+title+'</b>'+subtitle+'</div>';
function persistNotifications(change){
  try {
    const next=structuredClone(db);
    ensureNotifications(next);
    change(next.notifications);
    localStorage.setItem(KEY,JSON.stringify(next));
    db=next;
    render();
  }catch(error){toast(error.message||'تعذر حفظ حالة الإشعارات',true);}
}
function showFlying(event){
  if(typeof document==='undefined')return;
  let stack=document.getElementById('wt-toast-stack');
  if(!stack){stack=document.createElement('div');stack.id='wt-toast-stack';stack.className='wt-toast-stack';stack.setAttribute('aria-live','polite');stack.setAttribute('aria-atomic','false');document.body.append(stack);}
  const type=Object.hasOwn(notificationIcons,event.type)?event.type:'info';
  const box=document.createElement('div');
  box.className='wt-fly wt-fly--'+type;
  box.setAttribute('role',type==='warning'||type==='error'?'alert':'status');
  box.innerHTML='<span class="wt-fly-icon" aria-hidden="true">'+notificationIcons[type]+'</span>'
    +'<div class="wt-fly-copy"><strong>'+esc(event.title)+'</strong><small>'+esc(event.detail||'White tex • سجل التشغيل')+'</small></div>'
    +'<button class="wt-fly-close" type="button" data-act="dismiss-toast" aria-label="إغلاق الإشعار">×</button><span class="wt-fly-timer" aria-hidden="true"></span>';
  stack.prepend(box);
  while(stack.children.length>3)stack.lastElementChild.remove();
  window.setTimeout(()=>box.remove(),5700);
}
function toast(msg,error=false){showFlying(newNotification(error?'error':'info',msg));}
function recordLocalNotice(event){
  try{
    const next=structuredClone(db);
    appendNotifications(next,[event]);
    localStorage.setItem(KEY,JSON.stringify(next));
    db=next;
    render();
    showFlying(event);
  }catch(error){toast(error.message||'تعذر حفظ التنبيه',true);}
}
function mutator(fn,success='تم الحفظ'){
  try{
    const d=structuredClone(db);
    ensureFactoryState(d);ensureWholesaleState(d);ensureNotifications(d);
    fn(d);
    const events=(!db.demoMode&&d.demoMode)
      ?[newNotification('info','تم تجهيز بيانات العرض','المعلومات المعروضة تجريبية ومحلية فقط')]
      :buildNotifications(db,d);
    appendNotifications(d,events);
    localStorage.setItem(KEY,JSON.stringify(d));
    db=d;modal=null;render();
    if(events.length){
      events.slice(0,3).forEach(showFlying);
      if(events.length>3)toast('تم تسجيل '+events.length+' حركات في مركز الإشعارات');
    }else toast(success);
  }catch(e){toast(e.message||'حدث خطأ',true);}
}
function log(d,message){d.audit.unshift({id:id(),at:new Date().toISOString(),message});}
function newStyle(d,f){let c=code(required(f.get('code'),'كود الموديل')),sizes=list(f.get('sizes')),colors=list(f.get('colors'));if(d.styles.some(x=>x.code===c))throw Error('كود الموديل موجود');if(!sizes.length||!colors.length)throw Error('أدخل مقاسات وألوان');if(sizes.length*colors.length>100)throw Error('الحد الأقصى 100 متغير');let variants=sizes.flatMap(sz=>colors.map(cl=>({id:id(),size:sz,color:cl,sku:c+'-'+code(sz)+'-'+code(cl)})));if(new Set(variants.map(x=>x.sku)).size!==variants.length)throw Error('أكواد المتغيرات متكررة');d.styles.unshift({id:id(),code:c,name:required(f.get('name'),'اسم الموديل'),season:str(f.get('season')),category:str(f.get('category'))||'ملابس',sellingPrice:nonnegative(f.get('price'),'السعر'),variants,sizes,colors,bom:[]});log(d,'إضافة موديل '+c);}
function newMaterial(d,f){let c=code(required(f.get('code'),'كود الخامة'));if(d.materials.some(x=>x.code===c))throw Error('كود الخامة موجود');d.materials.unshift({id:id(),code:c,name:required(f.get('name'),'اسم الخامة'),category:str(f.get('category'))||'خامات',unit:str(f.get('unit')),stock:0,avgCost:0});log(d,'إضافة خامة '+c);}
function receive(d,f){let m=d.materials.find(x=>x.id===f.get('materialId'));if(!m)throw Error('اختر خامة');let q=round(positive(f.get('quantity'),'الكمية')),cost=nonnegative(f.get('unitCost'),'السعر');m.avgCost=price((m.stock*m.avgCost+q*cost)/(m.stock+q));m.stock=round(m.stock+q);d.ledger.unshift({id:id(),at:new Date().toISOString(),materialId:m.id,qty:q,cost,kind:'receive',reference:str(f.get('reference'))||'استلام مخزن'});log(d,'استلام '+q+' '+m.unit+' من '+m.name);}
function setBom(d,styleId,f){let s=d.styles.find(x=>x.id===styleId);if(!s)throw Error('الموديل غير موجود');let rows=[];d.materials.forEach(m=>{let v=str(f.get('bom_'+m.id));if(v){let q=Number(v);if(q<0||!Number.isFinite(q))throw Error('كمية غير صالحة');if(q>0)rows.push({materialId:m.id,qty:round(q)});}});if(!rows.length)throw Error('اختر خامة واحدة على الأقل');s.bom=rows;log(d,'تحديث BOM الموديل '+s.code);}
function newOrder(d,f){let s=d.styles.find(x=>x.id===f.get('styleId'));if(!s)throw Error('اختر موديلًا');let v=s.variants.find(x=>x.id===f.get('variantId'));if(!v)throw Error('اختر المقاس واللون');let q=positive(f.get('quantity'),'عدد القطع');if(!Number.isInteger(q))throw Error('عدد القطع يجب أن يكون صحيحًا');let oid=id();let ref='WO-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+oid.slice(0,6).toUpperCase();d.orders.unshift({id:oid,ref,styleId:s.id,variantId:v.id,qty:q,customer:str(f.get('customer')),due:str(f.get('due')),status:'planned',materialCost:0,labor:0,overhead:0,good:0,reject:0,history:[{at:new Date().toISOString(),stage:'planned'}],used:[]});log(d,'إنشاء أمر '+ref);}
function advance(d,oid){let o=d.orders.find(x=>x.id===oid);if(!o)throw Error('أمر غير موجود');let ix=stages.indexOf(o.status);if(ix<0||ix>=stages.length-1)throw Error('لا يمكن الانتقال من هذه المرحلة');checkStageBeforeAdvance(d,o);requireCuttingBundleBalance(d,o);if(o.status==='planned'){let s=d.styles.find(x=>x.id===o.styleId);if(!s?.bom.length)throw Error('لا توجد قائمة مكونات BOM للموديل');let needs=s.bom.map(x=>{let m=d.materials.find(y=>y.id===x.materialId);if(!m)throw Error('خامة غير موجودة');let needed=round(o.qty*x.qty);if(m.stock+1e-6<needed)throw Error('رصيد '+m.name+' غير كافٍ: المطلوب '+num(needed)+' والمتاح '+num(m.stock));return{materialId:m.id,qty:needed,cost:m.avgCost};});let rollAllocations=[];needs.forEach(x=>{let m=d.materials.find(y=>y.id===x.materialId);if(m.unit==='متر')rollAllocations.push(...allocateFabricRolls(d,m.id,x.qty,o.id));m.stock=round(Math.max(0,m.stock-x.qty));d.ledger.unshift({id:id(),at:new Date().toISOString(),materialId:m.id,qty:-x.qty,cost:x.cost,kind:'issue',reference:o.ref,orderId:o.id});});o.rollAllocations=rollAllocations;o.used=needs;o.materialCost=price(needs.reduce((a,x)=>a+x.qty*x.cost,0));}
if(o.status==='quality'&&(o.good<=0||o.good+o.reject!==o.qty))throw Error('قبل مغادرة الجودة: المقبول > 0 ومجموع المقبول والمرفوض = كمية الأمر');
if(o.status==='packing'){if(o.good<=0||o.good+o.reject!==o.qty)throw Error('يجب اعتماد نتائج الجودة قبل ترحيل الإنتاج');if(d.finished.some(x=>x.orderId===o.id))throw Error('تم ترحيل الأمر مسبقًا');d.finished.unshift({id:id(),orderId:o.id,variantId:o.variantId,qty:o.good,unitCost:price((o.materialCost+o.labor+o.overhead+pieceworkCost(d,o.id))/o.good)});}
o.status=stages[ix+1];o.history.push({at:new Date().toISOString(),stage:o.status});log(d,'انتقال '+o.ref+' إلى '+labels[o.status]);}
function quality(d,oid,f){let o=d.orders.find(x=>x.id===oid);if(!o||o.status!=='quality')throw Error('الجودة متاحة في مرحلة الجودة فقط');let good=nonnegative(f.get('good'),'المقبول'),reject=nonnegative(f.get('reject'),'المرفوض');if(!Number.isInteger(good)||!Number.isInteger(reject)||good+reject>o.qty)throw Error('كميات الجودة غير صالحة');o.good=good;o.reject=reject;o.labor=nonnegative(f.get('labor'),'أجور التشغيل');o.overhead=nonnegative(f.get('overhead'),'تكلفة إضافية');log(d,'فحص جودة '+o.ref);}
function ready(vId){return availableFinishedStock(db,vId);}
function metric(label,value,desc){return '<div class="stat"><small>'+label+'</small><strong>'+value+'</strong><span>'+desc+'</span></div>';}
function heading(title,desc,actions=''){return '<div class="header"><div><h1>'+title+'</h1><p>'+desc+'</p></div><div class="actions">'+actions+'</div></div>';}
function table(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>';}
function dashboard(){let live=db.orders.filter(o=>!['completed','cancelled'].includes(o.status)),done=db.orders.filter(o=>o.status==='completed');return heading('لوحة تحكم المصنع','تابع نشاط المصنع والموديلات والخامات والإنتاج.',btn('＋ أمر تصنيع','new-order','','primary'))+'<div class="hero"><span class="eyebrow">WHITE TEX / TEXTILE OPERATIONS</span><h2>White <span class="hero-wordmark">tex</span> <span class="hero-divider">|</span> جودة في كل مرحلة.</h2><p>رحلة تصنيع واضحة من القص والفرز البدائي إلى الطباعة والمكواة وجودة البرزنتيشن والتعبئة.</p>'+btn('إضافة موديل جديد','new-style','','dark')+(isDemoEligible(db)?btn('ملء جميع الشاشات ببيانات تجربة','seed','','primary'):'')+'</div><div class="stats">'+metric('الموديلات',num(db.styles.length),'موديل مع متغيرات المقاس واللون')+metric('أوامر نشطة',num(live.length),'قطع قيد الإنتاج: '+num(live.reduce((n,o)=>n+o.qty,0)))+metric('قطع تامة متاحة',num(db.finished.reduce((n,x)=>n+x.qty,0)-wholesaleOverview(db).delivered),'رصيد بعد التسليم')+metric('قيمة مخزون الخام',cur(db.materials.reduce((n,m)=>n+m.stock*m.avgCost,0)),'تكلفة تقديرية')+'</div><div class="grid"><section class="card"><h3>أوامر تحت التشغيل</h3><p class="sub">آخر الأوامر والإنتاج الحالي</p>'+ (live.length?table(['رقم الأمر','الموديل','الكمية','المرحلة',''],live.slice(0,7).map(o=>'<tr>'+td('<span class="mono">'+esc(o.ref)+'</span>'+(o.batchRef?'<small class="batch-tag">'+esc(o.batchRef)+'</small>':'') )+td(esc(style(o.styleId)?.name))+td(num(o.qty))+td(status(o.status))+td('<button class="rowbtn" data-act="show-order" data-id="'+o.id+'">التفاصيل</button>')+'</tr>').join('')):empty('لا توجد أوامر مفتوحة','أضف موديلًا ومكونات وأمر تصنيع.'))+'</section><section class="card"><h3>تنبيهات الأرصدة</h3><p class="sub">خامات رصيدها أقل من 25 وحدة</p>'+(db.materials.length?db.materials.filter(m=>m.stock<25).map(m=>'<div class="data-line"><b>'+esc(m.name)+'</b><span class="bad">'+num(m.stock)+' '+esc(m.unit)+'</span></div>').join('')||'<p class="good">كل الأرصدة الحالية أعلى من مستوى التنبيه</p>':empty('لا توجد خامات','عرّف الخامات واستلم الرصيد أولًا.'))+'</section></div>';}
function stylesPage(){let rows=db.styles.filter(s=>(s.name+s.code+s.category).toLowerCase().includes(search.toLowerCase()));return heading('الموديلات والمنتجات','موديلات ومقاسات وألوان مستقلة لكل SKU.',btn('＋ إضافة موديل','new-style','','primary'))+'<div class="toolbar"><input id="search" value="'+esc(search)+'" placeholder="ابحث باسم الموديل أو الكود..."><span class="muted">'+num(db.styles.length)+' موديل</span></div>'+(rows.length?'<div class="products">'+rows.map(s=>'<article class="product"><div class="product-head">♧</div><div class="product-body"><small class="eyebrow">'+esc(s.code)+' · '+esc(s.category)+'</small><h3>'+esc(s.name)+'</h3><p>'+num(s.variants.length)+' متغير · '+esc(s.season)+'</p><div class="product-footer"><strong>'+cur(s.sellingPrice)+'</strong>'+btn('التفاصيل','show-style',s.id)+'</div></div></article>').join('')+'</div>':empty('لا توجد موديلات','أضف أول موديل للتصنيع.'));}
function materialsPage(){return heading('الأقمشة والخامات','تتبع مخزون الخام والاستلام وتكلفة الوحدة.',btn('＋ استلام خامات','new-receipt')+btn('＋ إضافة خامة','new-material','','primary'))+'<section class="card">'+(db.materials.length?table(['الكود','الخامة','التصنيف','الرصيد','متوسط التكلفة','القيمة',''],db.materials.map(m=>'<tr>'+td('<span class="mono">'+esc(m.code)+'</span>')+td('<b>'+esc(m.name)+'</b>')+td(esc(m.category))+td('<b class="'+(m.stock<25?'bad':'good')+'">'+num(m.stock)+' '+esc(m.unit)+'</b>')+td(cur(m.avgCost))+td(cur(m.stock*m.avgCost))+td('<button class="rowbtn" data-act="receipt-for" data-id="'+m.id+'">استلام</button>')+'</tr>').join('')):empty('لا توجد خامات','ابدأ بتعريف قماش أو خامة.'))+'</section>';}
function ordersPage(){return heading('أوامر الإنتاج','تابع كل مراحل المصنع من القص والفرز البدائي حتى التعبئة.',btn('＋ دفعة مقاسات وألوان','matrix-order')+btn('＋ أمر جديد','new-order','','primary'))+'<section class="card">'+(db.orders.length?table(['المرجع','الموديل','المقاس/اللون','الكمية','العميل','المرحلة',''],db.orders.map(o=>'<tr>'+td('<span class="mono">'+esc(o.ref)+'</span>')+td(esc(style(o.styleId)?.name))+td(esc(variant(o)?.size)+' / '+esc(variant(o)?.color))+td(num(o.qty))+td(esc(o.customer||'—'))+td(status(o.status))+td('<button class="rowbtn" data-act="show-order" data-id="'+o.id+'">عرض</button>')+'</tr>').join('')):empty('لا توجد أوامر تصنيع','أضف موديلًا ومكونات ثم أنشئ أمر تصنيع.'))+'</section>';}
function qualityPage(){let arr=db.orders.filter(o=>o.status==='quality');return heading('فحص الجودة','تسجيل المقبول والمرفوض قبل الطباعة، وترحيل التام بعد التعبئة.')+'<section class="card"><h3>بانتظار الجودة</h3><p class="sub">استكمال الفحص؛ الترحيل للمخزن بعد التعبئة</p>'+(arr.length?arr.map(o=>'<div class="data-line"><b>'+esc(o.ref)+' · '+esc(style(o.styleId)?.name)+'</b>'+btn('فحص','quality',o.id,'primary')+'</div>').join(''):empty('لا توجد أوامر تنتظر الفحص','تابع مراحل أمر الإنتاج حتى مرحلة الجودة.'))+'</section>';}
function reportsPage(){let data=db.styles.flatMap(s=>s.variants.map(v=>({...v,name:s.name,qty:ready(v.id)}))).filter(x=>x.qty);return heading('التقارير وحركة المخزون','حركة الخامات ومخزون الملابس الجاهزة وسجل العمليات.')+'<div class="stats">'+metric('أوامر مكتملة',num(db.orders.filter(x=>x.status==='completed').length),'من جميع الأوامر')+metric('قطع تامة متاحة',num(db.finished.reduce((n,x)=>n+x.qty,0)-wholesaleOverview(db).delivered),'بعد تسليمات الجملة')+metric('قطع مرفوضة',num(db.orders.reduce((n,x)=>n+x.reject,0)),'في فحص الجودة')+metric('حركة مخزون',num(db.ledger.length),'صرف واستلام خامات')+'</div><section class="card"><h3>المخزون التام حسب SKU</h3><p class="sub">كل لون ومقاس مستقل</p>'+ (data.length?table(['كود SKU','الموديل','المقاس','اللون','المتوفر'],data.map(v=>'<tr>'+td('<span class="mono">'+esc(v.sku)+'</span>')+td(esc(v.name))+td(esc(v.size))+td(esc(v.color))+td(num(v.qty))+'</tr>').join('')):empty('مخزن التام فارغ','سيظهر المخزون بعد انتهاء التعبئة.'))+'</section><section class="card"><h3>حركة الأقمشة والخامات</h3><p class="sub">آخر 100 حركة</p>'+ (db.ledger.length?table(['الخامة','العملية','الكمية','التكلفة','المرجع'],db.ledger.slice(0,100).map(x=>'<tr>'+td(esc(mat(x.materialId)?.name))+td('<span class="'+(x.qty>0?'receipt':'issue')+'">'+(x.qty>0?'استلام':'صرف')+'</span>')+td(num(x.qty))+td(cur(x.cost))+td(esc(x.reference))+'</tr>').join('')):empty('لا توجد حركات مخزون','ستسجل كل عملية استلام أو صرف هنا.'))+'</section><section class="card"><h3>حركة تسليم الملابس التامة</h3><p class="sub">أحدث أذون التسليم — لا يشمل المرتجعات بعد</p>'+(db.finishedDispatches.length?table(['مرجع التسليم','العميل','عدد القطع','قيمة التسليم'],db.finishedDispatches.slice(0,50).map(d=>'<tr>'+td('<span class="mono">'+esc(d.reference)+'</span>')+td(esc(d.customer))+td(num(d.lines.reduce((n,l)=>n+l.qty,0)))+td(cur(d.lines.reduce((n,l)=>n+l.qty*l.unitPrice,0)))+'</tr>').join('')):empty('لا توجد تسليمات جملة','سيظهر سجل التسليم بعد إصدار أول إذن.'))+'</section><section class="card"><h3>سجل العمليات</h3>'+db.audit.slice(0,30).map(x=>'<div class="data-line"><span>'+esc(x.message)+'</span><small>'+new Date(x.at).toLocaleDateString('ar-EG')+'</small></div>').join('')+'</section>';}
function settingsPage(){
  const account=cloudIdentity();
  const cloud=account
    ? '<p class="notes">مسجّل بحساب <b>'+esc(account.email)+'</b>. النسخ السحابي يدوي وليس مزامنة فورية بين الأجهزة.</p>'
      +'<div class="actions">'+(db.demoMode?'<p class="tips">نسخة عرض: رفع بيانات التجربة إلى السحابة معطّل لمنع خلطها بالبيانات الحقيقية.</p>':btn('رفع نسخة الجهاز إلى السحابة','cloud-save','','primary'))
      +btn('استرجاع نسخة السحابة','cloud-restore')+btn('تسجيل الخروج','cloud-logout')+'</div>'
    : '<p class="notes">يمكن استخدام بريد وكلمة مرور لحساب موجود في Supabase الخاص بمشروع AMMCO. لا يُنشئ هذا النظام حسابات جديدة، ولا يقرأ بيانات AMMCO.</p>'
      +'<div class="form-grid"><label class="field">البريد الإلكتروني<input id="cloud-email" type="email" autocomplete="username" required></label>'
      +'<label class="field">كلمة المرور<input id="cloud-password" type="password" autocomplete="current-password" required></label></div>'
      +btn('تسجيل الدخول للسحابة','cloud-login','','primary');
  return heading('إدارة البيانات','بيانات العمل تبقى محليًا، مع نسخ احتياطي سحابي اختياري.')
    +'<div class="two"><section class="card"><h3>نسخ احتياطي على الجهاز</h3>'
    +'<p class="notes">صدّر بياناتك إلى JSON أو استورد نسخة من جهازك. الاستيراد يستبدل جميع البيانات.</p>'
    +btn('↓ تنزيل نسخة JSON','export','','primary')
    +'<p><input id="import" type="file" accept=".json,application/json"></p></section>'
    +'<section class="card"><h3>النسخ الاحتياطي السحابي — Supabase</h3>'
    +'<p class="notes">نسخة مستقلة لكل مستخدم داخل جدول خاص بالملابس. الحفظ والاسترجاع يتمان يدويًا فقط.</p>'
    +cloud+'</section>'
    +'<section class="card"><h3>بيانات عرض شاملة لجميع الشاشات</h3>'
    +'<p class="notes">موديلات وخامات ورولات وعمّال ودفعات قص وأوامر إنتاج في كل مرحلة ونتائج جودة ومخزون تام وطلبات جملة وتسليمات وتقارير. جميعها <b>افتراضية</b> وتُحمّل فقط عندما لا توجد بيانات في المتصفح.</p>'
    +(isDemoEligible(db)?btn('تحميل بيانات تجربة شاملة','seed','','primary'):'<p class="tips">توجد بيانات حاليًا؛ للحفاظ عليها لا يمكن خلطها ببيانات العرض. يمكنك تنزيل نسخة JSON ثم إعادة ضبط المتصفح إن أردت تجربة جديدة.</p>')+'</section>'
    +'<section class="card"><h3>حذف البيانات</h3>'
    +'<p class="notes">يحذف البيانات المحلية دون حذف النسخ السحابية. يمكن الاستعادة فقط إن كانت لديك نسخة محفوظة.</p>'
    +btn('إعادة ضبط النظام','reset','','danger')+'</section></div>'
    +'<div class="tips">هذه النسخة ليست مزامنة متعددة المستخدمين؛ التغييرات على جهاز آخر لن تظهر تلقائيًا. لا تستخدم بيانات حساسة أو حقيقية قبل اكتمال الصلاحيات والمعاملات الخادمية والتدقيق.</div>';
}
function styleDetail(){let s=style(detail);if(!s)return empty('موديل غير موجود','');let req=s.bom.map(b=>{let m=mat(b.materialId);return '<tr>'+td(esc(m?.name))+td(num(b.qty)+' '+esc(m?.unit))+td(num(m?.stock))+td(cur((m?.avgCost||0)*b.qty))+'</tr>';}).join('');return heading('موديل '+esc(s.code),esc(s.name),btn('＋ دفعة مقاسات وألوان','matrix-order',s.id,'primary')+btn('تعديل BOM','bom',s.id)+btn('رجوع','nav','styles'))+'<div class="stats">'+metric('المقاسات',s.sizes.length,s.sizes.map(esc).join(' · '))+metric('الألوان',s.colors.length,s.colors.map(esc).join(' · '))+metric('عدد SKU',s.variants.length,'متغير مستقل')+metric('تكلفة مواد/قطعة',cur(s.bom.reduce((n,b)=>n+b.qty*(mat(b.materialId)?.avgCost||0),0)),'تقديرية')+'</div><section class="card"><h3>قائمة المكونات BOM</h3>'+table(['الخامة','الاستهلاك/قطعة','الرصيد','التكلفة'],req||'<tr><td colspan="4">لا توجد مكونات بعد</td></tr>')+'</section><section class="card"><h3>أكواد المقاسات والألوان</h3>'+table(['SKU','المقاس','اللون','الرصيد التام'],s.variants.map(v=>'<tr>'+td('<span class="mono">'+esc(v.sku)+'</span>')+td(esc(v.size))+td(esc(v.color))+td(num(ready(v.id)))+'</tr>').join(''))+'</section>';}

function workersPage() {
  const total = db.workLogs.reduce((sum, row) => sum + row.cost, 0);
  return heading('العمال والإنتاجية', 'متابعة إنتاج العامل والأجور بالقطعة حسب المرحلة.', btn('＋ إضافة عامل', 'new-worker', '', 'primary'))
    + '<div class="stats">' + metric('العمال', num(db.workers.length), 'عامل مسجل')
    + metric('حركات التشغيل', num(db.workLogs.length), 'حزمة إنتاج مسجلة')
    + metric('أجور القطعة', cur(total), 'الأجور الفعلية المسجلة') + '</div>'
    + '<section class="card"><h3>العمال</h3>'
    + (db.workers.length ? table(['الكود', 'العامل', 'التخصص', 'أجر القطعة'],
      db.workers.map(w => '<tr>' + td(esc(w.code)) + td(esc(w.name)) + td(esc(w.role)) + td(cur(w.rate)) + '</tr>').join(''))
      : empty('لا يوجد عمال', 'أضف عاملًا لتسجيل إنتاجه.')) + '</section>'
    + '<section class="card"><h3>إنتاج المراحل</h3>'
    + (db.workLogs.length ? table(['الأمر', 'العامل', 'المرحلة', 'الكمية', 'الأجر', 'الدفعة'],
      db.workLogs.slice(0, 100).map(w => '<tr>' + td(esc(order(w.orderId)?.ref)) + td(esc(db.workers.find(x => x.id === w.workerId)?.name))
        + td(esc(labels[w.stage])) + td(num(w.qty)) + td(cur(w.cost)) + td(esc(w.batchRef || '—')) + '</tr>').join(''))
      : empty('لا توجد حركات تشغيل', 'افتح أمر تصنيع في إحدى مراحل التشغيل لتسجيل الإنتاج.')) + '</section>';
}
function rollsPage() {
  return heading('رولات الأقمشة', 'متابعة درجة الصبغة والعرض ورصيد كل رول.', btn('＋ استلام رول', 'new-roll', '', 'primary'))
    + '<div class="stats">' + metric('رولات مسجلة', num(db.fabricRolls.length), 'رول')
    + metric('رصيد الرولات', num(db.fabricRolls.reduce((sum, r) => sum + r.remaining, 0)) + ' متر', 'الرصيد المتبقي') + '</div>'
    + '<section class="card">' + (db.fabricRolls.length ? table(['الرول', 'القماش', 'الصبغة', 'العرض', 'المستلم', 'المتبقي'],
      db.fabricRolls.map(r => '<tr>' + td(esc(r.rollNo)) + td(esc(mat(r.materialId)?.name)) + td(esc(r.shade || '—'))
        + td(r.width ? num(r.width) + ' سم' : '—') + td(num(r.received) + ' متر') + td(num(r.remaining) + ' متر') + '</tr>').join(''))
      : empty('لا توجد رولات', 'ابدأ بتسجيل استلام رول قماش بوحدة متر.')) + '</section>'
    + '<p class="tips">عند القص، يتم صرف الأرصدة المسجلة بالرولات أولًا بترتيب الاستلام، وتظهر الكميات القديمة كرصيد بدون رول.</p>';
}
function orderDetail() {
  const o = order(detail);
  if (!o) return empty('أمر غير موجود', '');
  const current = stages.indexOf(o.status);
  const next = nextStageAction[o.status];
  const labor = pieceworkCost(db, o.id);
  const progress = stageProgress(db, o.id, o.status);
  let output = heading('أمر ' + esc(o.ref), esc(style(o.styleId)?.name) + ' · ' + esc(variant(o)?.sku), (o.batchId ? btn('فتح الدفعة','show-batch',o.batchId) : '') + btn('رجوع', 'nav', 'orders'))
    + '<div class="steps">' + stages.map((s, i) => '<div class="step ' + (i < current ? 'done' : i === current ? 'current' : '') + '">' + esc(labels[s]) + '</div>').join('') + '</div>'
    + '<div class="stats">' + metric('كمية الأمر', num(o.qty), 'قطعة')
    + metric('تكلفة الخامات', cur(o.materialCost), 'بعد بدء القص')
    + metric('تكاليف التشغيل', cur(o.labor + o.overhead + labor), 'أجور وعمالة إضافية')
    + metric('تكلفة القطعة السليمة', o.good ? cur((o.materialCost + o.labor + o.overhead + labor) / o.good) : '—', num(o.good) + ' قطعة مقبولة') + '</div>'
    + '<div class="grid"><section class="card"><h3>بيانات الأمر</h3>'
    + '<div class="data-line">الحالة ' + status(o.status) + '</div>'
    + '<div class="data-line">المقاس واللون <b>' + esc(variant(o)?.size) + ' / ' + esc(variant(o)?.color) + '</b></div>'
    + '<div class="data-line">العميل <b>' + esc(o.customer || '—') + '</b></div>'
    + '<div class="data-line">الكمية <b>' + num(o.qty) + '</b></div>'
    + '<div class="data-line">المقبول <b>' + num(o.good) + '</b></div>'
    + '<div class="data-line">المرفوض <b>' + num(o.reject) + '</b></div>'
    + '<p class="actions">' + (o.status === 'quality' ? btn('تسجيل الجودة', 'quality', o.id) : '')
    + (workStages.includes(o.status) ? btn('تسجيل إنتاج عامل', 'stage-work', o.id) : '')
    + (next ? btn(next, 'advance', o.id, 'primary') : '') + '</p></section>'
    + '<section class="card"><h3>تاريخ مراحل التصنيع</h3>'
    + o.history.map(h => '<div class="data-line"><b>' + esc(labels[h.stage]) + '</b><small>' + new Date(h.at).toLocaleString('ar-EG') + '</small></div>').join('')
    + '<p class="tips">صرف الخامات عند بدء القص فقط؛ تُثبت نتيجة الجودة قبل الطباعة، ولا يُرحّل المخزون التام إلا بعد التعبئة.</p></section></div>';
  if (workStages.includes(o.status)) {
    output += '<section class="card"><h3>إنتاج المرحلة: ' + esc(labels[o.status]) + '</h3>'
      + '<p class="sub">المسجل ' + num(progress.quantity) + ' من ' + num(stageTargetQuantity(o))
      + ' قطعة. إذا بدأت التسجيل، يجب إتمام كمية المرحلة قبل الانتقال.</p>'
      + btn('＋ تسجيل دفعة', 'stage-work', o.id, 'primary') + '</section>';
  }
  const cut = cuttingBundleStats(db, o.id);
  if (o.status === 'planned' || cut.rows.length) {
    output += '<section class="card"><h3>حزم القص</h3><p class="sub">حزم مخططة: '+num(cut.total)+' من '+num(o.qty)+' قطعة.'
      +(cut.rows.length && cut.total !== o.qty ? ' يجب استكمال حزم القص قبل صرف الخامات.' : '')
      +'</p>'+(o.status === 'planned' ? btn('＋ حزمة قص','new-bundle',o.id,'primary') : '')
      +(cut.rows.length ? table(['رقم الحزمة','SKU','الكمية','ملاحظات'],cut.rows.map(r=>'<tr>'
        +td('<span class="mono">'+esc(r.bundleNo)+'</span>')+td(esc(variant(o)?.sku))
        +td(num(r.qty))+td(esc(r.notes||'—'))+'</tr>').join(''))
        : '<p class="notes">اختياري: يمكنك بدء القص مباشرة دون تسجيل حزم، أو تسجيل حزم يجب أن يساوي مجموعها كمية الأمر.</p>')
      +'</section>';
  }
  if (o.rollAllocations?.length) {
    output += '<section class="card"><h3>رولات القماش المصروفة</h3>'
      + table(['الرول', 'الكمية'], o.rollAllocations.map(r => '<tr>' + td(esc(r.rollNo)) + td(num(r.qty) + ' متر') + '</tr>').join(''))
      + '</section>';
  }
  return output;
}

function batchesPage(){
  const arr=productionBatches(db);
  return heading('دفعات الإنتاج متعددة المقاسات','إنشاء دفعة لموديل واحد مع أوامر مستقلة لكل مقاس ولون.',btn('＋ دفعة مقاسات وألوان','matrix-order','','primary'))
    +'<div class="stats">'+metric('دفعات',num(arr.length),'دفعات مرتبطة بأوامر تصنيع')
    +metric('أوامر داخل الدفعات',num(arr.reduce((sum,b)=>sum+b.orders.length,0)),'متغيرات المقاسات والألوان')
    +metric('قطع مخططة',num(arr.reduce((sum,b)=>sum+b.qty,0)),'إجمالي القطع')
    +metric('أوامر مكتملة',num(arr.reduce((sum,b)=>sum+b.completed,0)),'بعد التعبئة والترحيل')+'</div>'
    +'<section class="card"><h3>دفعات الموديلات</h3>'
    +(arr.length?table(['الدفعة','الموديل','عدد SKU','الإجمالي','المكتمل','العميل',''],
      arr.map(b=>'<tr>'+td('<span class="mono">'+esc(b.ref)+'</span>')+td(esc(style(b.styleId)?.name))
      +td(num(b.orders.length))+td(num(b.qty))+td(num(b.completed)+' / '+num(b.orders.length))
      +td(esc(b.customer||'—'))+td('<button class="rowbtn" data-act="show-batch" data-id="'+esc(b.id)+'">عرض التفاصيل</button>')+'</tr>').join(''))
      :empty('لا توجد دفعات إنتاج بعد','اختر موديلًا وحدد كميات المقاسات والألوان لإنشاء دفعة.'))+'</section>';
}
function batchDetail(){
  const b=productionBatches(db).find(x=>x.id===detail);
  if(!b)return empty('الدفعة غير موجودة','');
  const s=style(b.styleId);
  const byVariant=new Map(b.orders.map(o=>[o.variantId,o]));
  return heading('دفعة '+esc(b.ref),esc(s?.name)+' · '+esc(b.customer||'بدون عميل'),btn('رجوع','nav','batches'))
    +'<div class="stats">'+metric('إجمالي القطع',num(b.qty),'قطعة مخططة')
    +metric('عدد المتغيرات',num(b.orders.length),'مقاس ولون')
    +metric('الأوامر المكتملة',num(b.completed),'من '+num(b.orders.length))
    +metric('قطع اجتازت الجودة',num(b.good),'حتى الآن')+'</div>'
    +'<section class="card"><h3>مصفوفة المقاسات والألوان</h3><p class="sub">كل خلية تمثل عدد القطع ضمن أمر مستقل.</p>'
    +table(['المقاس / اللون',...(s?.colors||[])],
      (s?.sizes||[]).map(size=>'<tr>'+td('<b>'+esc(size)+'</b>')
        +(s.colors||[]).map(color=>{const variant=s.variants.find(v=>v.size===size&&v.color===color);
          const o=byVariant.get(variant?.id);return td(o?'<b>'+num(o.qty)+'</b>':'—');}).join('')+'</tr>').join(''))
    +'</section><section class="card"><h3>أوامر الدفعة</h3>'
    +table(['رقم الأمر','المقاس','اللون','الكمية','المرحلة',''],
      b.orders.map(o=>'<tr>'+td('<span class="mono">'+esc(o.ref)+'</span>')
        +td(esc(variant(o)?.size))+td(esc(variant(o)?.color))+td(num(o.qty))
        +td(status(o.status))+td('<button class="rowbtn" data-act="show-order" data-id="'+esc(o.id)+'">فتح الأمر</button>')+'</tr>').join(''))
    +'</section><p class="tips">كل أمر له صرف خامات وتكلفة وفحص جودة مستقل. الدفعة رابط للتخطيط والتجميع فقط، وليست حركة مخزنية إضافية.</p>';
}

function wholesalePage(){
  const stats=wholesaleOverview(db);
  return heading('طلبات بيع الجملة','طلبات العملاء وتسليمات مخزون الملابس التامة.',btn('＋ طلب جملة','new-wholesale','','primary'))
    +'<div class="stats">'+metric('طلبات الجملة',num(stats.orders),'طلب')
    +metric('طلبات بانتظار التسليم',num(stats.open),'جزئي أو لم يبدأ')
    +metric('قطع تم تسليمها',num(stats.delivered),'من مخزون التام')
    +metric('قيمة التسليمات',cur(stats.value),'قيمة بيع تقديرية')+'</div>'
    +'<section class="card"><h3>طلبات العملاء</h3><p class="sub">يمكن تسليم الطلب على عدة أذون تسليم جزئية، ويتم خصم مخزون التام عند تأكيد الإذن فقط.</p>'
    +(db.wholesaleOrders.length
      ?table(['رقم الطلب','العميل','الموديل','المطلوب','المسلم','المتبقي','الحالة',''],
        db.wholesaleOrders.map(o=>{const p=wholesaleProgress(db,o);
          const state=p.status==='fulfilled'?'مكتمل':p.status==='partial'?'جزئي':'مفتوح';
          return '<tr>'+td('<span class="mono">'+esc(o.ref)+'</span>')
            +td(esc(o.customer))+td(esc(style(o.styleId)?.name))+td(num(p.ordered))
            +td(num(p.shipped))+td(num(p.remaining))
            +td('<span class="pill '+(p.status==='fulfilled'?'green':p.status==='partial'?'gold':'')+'">'+state+'</span>')
            +td('<button class="rowbtn" data-act="show-wholesale" data-id="'+esc(o.id)+'">التفاصيل</button>')+'</tr>';}).join(''))
      :empty('لا توجد طلبات جملة','أنشئ طلبًا بمقاسات وألوان ثم سلّم المنتجات من مخزون التام.'))
    +'</section><section class="card"><h3>آخر أذون التسليم</h3>'
    +(db.finishedDispatches.length
      ?table(['رقم الإذن','العميل','التاريخ','القطع','القيمة'],
        db.finishedDispatches.slice(0,25).map(x=>'<tr>'+td('<span class="mono">'+esc(x.reference)+'</span>')
          +td(esc(x.customer))+td(new Date(x.at).toLocaleDateString('ar-EG'))
          +td(num(x.lines.reduce((s,l)=>s+l.qty,0)))
          +td(cur(x.lines.reduce((s,l)=>s+l.qty*l.unitPrice,0)))+'</tr>').join(''))
      :empty('لا توجد أذون تسليم','سجّل التسليم بعد اكتمال الإنتاج واستلام مخزون التام.'))+'</section>';
}
function wholesaleDetail(){
  const o=db.wholesaleOrders.find(x=>x.id===detail);
  if(!o)return empty('طلب الجملة غير موجود','');
  const progress=wholesaleProgress(db,o);
  const state=progress.status==='fulfilled'?'مكتمل':progress.status==='partial'?'تم التسليم جزئيًا':'لم يبدأ التسليم';
  const history=db.finishedDispatches.filter(x=>x.orderId===o.id);
  return heading('طلب جملة '+esc(o.ref),esc(o.customer)+' · '+esc(style(o.styleId)?.name),
    (progress.remaining>0?btn('＋ إذن تسليم','ship-wholesale',o.id,'primary'):'')+btn('رجوع','nav','wholesale'))
    +'<div class="stats">'+metric('المطلوب',num(progress.ordered),'قطعة')
    +metric('الذي تم تسليمه',num(progress.shipped),'قطعة')
    +metric('المتبقي',num(progress.remaining),state)
    +metric('قيمة الطلب',cur(progress.amount),'إجمالي الكميات المطلوبة')+'</div>'
    +'<section class="card"><h3>المقاسات والألوان</h3>'
    +table(['SKU','المقاس','اللون','الطلب','تم التسليم','المتبقي','مخزون التام'],
      progress.lines.map(l=>'<tr>'+td('<span class="mono">'+esc(l.sku)+'</span>')
        +td(esc(l.size))+td(esc(l.color))+td(num(l.qty))+td(num(l.shipped))
        +td('<b>'+num(l.remaining)+'</b>')
        +td(num(availableFinishedStock(db,l.variantId)))+'</tr>').join(''))
    +'<p class="tips">حفظ الطلب لا يحجز المخزون. عند إنشاء إذن تسليم يتم التحقق من رصيد كل SKU ومن الكمية المتبقية في الطلب.</p></section>'
    +'<section class="card"><h3>أذون التسليم الخاصة بالطلب</h3>'
    +(history.length?table(['المرجع','التاريخ','القطع','القيمة'],
      history.map(d=>'<tr>'+td('<span class="mono">'+esc(d.reference)+'</span>')
        +td(new Date(d.at).toLocaleDateString('ar-EG'))
        +td(num(d.lines.reduce((s,l)=>s+l.qty,0)))
        +td(cur(d.lines.reduce((s,l)=>s+l.qty*l.unitPrice,0)))+'</tr>').join(''))
      :empty('لم يتم التسليم بعد','يمكنك تسجيل إذن جزئي عند توفر المنتج التام.'))+'</section>';
}


function cloudIntakePage(){
  const account=cloudIdentity();
  if(!account)return heading('طلبات العملاء المركزية','نسخة أولية مستقلة عن طلبات الجملة المحلية. لا بد من تسجيل الدخول بحساب له عضوية في المصنع.')
    +'<section class="card"><h3>دخول الموظف أو المدير</h3><p class="notes">استخدم بريدك وكلمة مرور حساب Supabase الموجود. لا ترسل كلمة المرور في المحادثة.</p>'
    +'<div class="form-grid"><label class="field">البريد الإلكتروني<input id="cloud-email" type="email" autocomplete="username" required></label>'
    +'<label class="field">كلمة المرور<input id="cloud-password" type="password" autocomplete="current-password" required></label></div>'
    +btn('تسجيل الدخول','cloud-login','','primary')+'</section>';
  const factory=cloudFactoriesState.find(x=>x.id===cloudFactorySelected);
  const canCreate=['owner','manager','sales'].includes(factory?.role);
  return heading('طلبات العملاء المركزية','حفظ طلبات جديدة مباشرة في Supabase بصلاحيات المصنع، منفصلة عن بيانات التشغيل المحلية.',
    btn('تحديث من السحابة','cloud-intake-refresh')+(canCreate&&!db.demoMode?btn('＋ طلب عميل جديد','new-cloud-intake','','primary'):''))
    +'<div class="tips">هذه شاشة استقبال الطلبات السحابية الأولية فقط. تعديل الطلب أو اعتماده أو حجز المخزون وإرساله للإنتاج لم يكتمل بعد.</div>'
    +(db.demoMode?'<div class="demo-banner">وضع العرض التجريبي مفعل؛ تم تعطيل إرسال الطلبات الحقيقية من هذا المتصفح. احفظ بيانات العرض وامسحها أولًا.</div>':'')
    +'<section class="card"><h3>الحساب وصلاحية الوصول</h3><div class="data-line"><b>'+esc(account.email)+'</b>'+btn('تسجيل الخروج','cloud-logout')+'</div>'
    +(factory?'<div class="data-line">المصنع <b>'+esc(factory.name)+'</b> — الدور <b>'+esc(factory.role)+'</b></div>':'<p class="notes">اضغط «تحديث من السحابة» لجلب المصانع المسندة لهذا الحساب.</p>')
    +(cloudIntakeMessage?'<p class="notes">'+esc(cloudIntakeMessage)+'</p>':'')
    +'</section><section class="card"><h3>طلبات العملاء — آخر 100 طلب</h3>'
    +(cloudIntakeState.length?table(['العميل','التواصل','القطع','القيمة','التاريخ','الحالة',''],
      cloudIntakeState.map(o=>{const t=intakeOrderTotal(o);return '<tr>'
        +td('<b>'+esc(o.customer_name)+'</b><small class="batch-tag">'+num(o.lines.length)+' أصناف · '+esc(o.id.slice(0,8))+'</small>')
        +td(esc(o.customer_contact||'—'))+td(num(t.quantity))+td(cur(t.amount))
        +td(new Date(o.created_at).toLocaleString('ar-EG'))+td('<span class="pill gold">● طلب جديد</span>')+td('<button type="button" class="rowbtn" data-act="view-cloud-intake" data-id="'+esc(o.id)+'">عرض التفاصيل</button>')+'</tr>';}).join(''))
      :empty('لا توجد طلبات محمّلة','بعد تسجيل الدخول اضغط تحديث، أو أنشئ أول طلب عميل.'))
    +'</section>';
}

const views={dashboard,styles:stylesPage,materials:materialsPage,rolls:rollsPage,workers:workersPage,orders:ordersPage,batches:batchesPage,'batch-detail':batchDetail,quality:qualityPage,wholesale:wholesalePage,'wholesale-detail':wholesaleDetail,'cloud-intake':cloudIntakePage,reports:reportsPage,settings:settingsPage,'style-detail':styleDetail,'order-detail':orderDetail};
function render(){const menus=[['dashboard','⌂','الرئيسية'],['styles','◈','الموديلات والمنتجات'],['materials','▤','الأقمشة والخامات'],['rolls','◧','رولات الأقمشة'],['workers','♙','العمال والإنتاجية'],['orders','▣','أوامر الإنتاج'],['batches','◈','دفعات المقاسات'],['quality','◉','مراقبة الجودة'],['wholesale','▧','بيع الجملة والتسليم'],['cloud-intake','▣','طلبات العملاء السحابية'],['reports','▥','التقارير'],['settings','⚙','النسخ الاحتياطي']];document.getElementById('app').innerHTML='<div class="layout"><aside class="side"><div class="logo"><span class="logo-icon" aria-hidden="true">WT</span><span class="logo-name">White<span class="logo-accent">tex</span><small>TEXTILE OPERATIONS</small></span></div>'+menus.map(v=>'<button class="nav '+(page===v[0]?'on':'')+'" data-act="nav" data-id="'+v[0]+'"><span class="nav-icon">'+navIcon(v[1])+'</span><span class="nav-label">'+v[2]+'</span></button>').join('')+'<div class="side-note">● وضع محلي<br>نسخ سحابي يدوي اختياري<br>لا يوجد تزامن فوري</div></aside><main class="main"><header class="top"><span class="top-crumb"><span class="brand-mini">WHITE TEX</span> <span class="top-separator">/</span> <strong>إدارة مصنع الملابس</strong></span><span class="status"><span class="status-dot"></span> '+(db.demoMode?'وضع عرض تجريبي':'نسخة تجريبية · نسخ سحابي يدوي')+'</span></header><div class="content">'+(db.demoMode?'<div class="demo-banner"><strong>بيانات افتراضية للعرض</strong> — جميع الموديلات والعملاء والعمال والطلبات المعروضة أمثلة غير حقيقية. لتجهيز عميل فعلي، احفظ النسخة المحلية ثم امسح بيانات العرض وأنشئ بياناته منفصلة.</div>':'')+(views[page]||dashboard)()+'<p class="foot">White tex · إدارة المصنع · Powered by PremierOS Garments</p></div></main></div>'+renderModal()+'<div id="toast" class="toast hidden"></div>';}
const inp=(label,name,type='text',value='',attrs='')=>'<label class="field">'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+attrs+'></label>';
const sel=(label,name,options)=>'<label class="field">'+label+'<select name="'+name+'" required><option value="">اختر...</option>'+options.map(x=>'<option value="'+esc(x[0])+'">'+esc(x[1])+'</option>').join('')+'</select></label>';
function renderModal(){if(!modal)return '';let kind=modal.type,t='',form='';
if(kind==='view-cloud-intake'){
  const o=cloudIntakeState.find(x=>x.id===modal.id&&x.factory_id===cloudFactorySelected);
  if(!o)return '';
  const totals=intakeOrderTotal(o);
  const rows=table(['SKU','المقاس','اللون','الكمية','السعر','الإجمالي'],
    o.lines.map(l=>'<tr>'+td('<span class="mono">'+esc(l.sku)+'</span>')+td(esc(l.size||'—'))
      +td(esc(l.color||'—'))+td(num(l.qty))+td(cur(l.unitPrice))
      +td('<b>'+cur(l.qty*l.unitPrice)+'</b>')+'</tr>').join(''));
  return '<div class="modal-bg" id="backdrop"><div class="modal intake-detail" role="dialog" aria-modal="true" aria-label="تفاصيل طلب العميل">'
    +'<div class="modal-h"><h2>طلب عميل — '+esc(o.customer_name)+'</h2>'+btn('إغلاق','close')+'</div>'
    +'<div class="modal-b"><div class="order-detail-summary">'
    +'<p><b>العميل:</b> '+esc(o.customer_name)+'</p>'
    +'<p><b>التواصل:</b> '+esc(o.customer_contact||'—')+'</p>'
    +'<p><b>وقت التسجيل:</b> '+esc(new Date(o.created_at).toLocaleString('ar-EG'))+'</p>'
    +'<p><b>الحالة:</b> <span class="pill gold">● طلب جديد — بانتظار الاعتماد</span></p>'
    +'</div><h3>بنود الطلب</h3>'+rows
    +'<div class="order-detail-summary order-detail-totals"><b>إجمالي الكمية: '+num(totals.quantity)+' قطعة</b>'
    +'<b>إجمالي القيمة: '+cur(totals.amount)+'</b></div>'
    +(o.notes?'<div class="notes"><b>ملاحظات العميل:</b> '+esc(o.notes)+'</div>':'')
    +'<p class="tips">بيانات محفوظة على الخادم للعرض فقط. الاعتماد والتعديل وحجز المخزون لم تُفعّل بعد.</p>'
    +'</div><div class="modal-f">'+btn('إغلاق','close')+'</div></div></div>';
}
if(kind==='new-style'){t='موديل ملابس جديد';form='<div class="form-grid">'+inp('كود الموديل','code','text','','required placeholder="SH-101"')+inp('اسم الموديل','name','text','','required')+inp('التصنيف','category')+inp('الموسم','season')+inp('المقاسات بفاصلة','sizes','text','S, M, L, XL','required')+inp('الألوان بفاصلة','colors','text','أسود, أبيض','required')+inp('سعر البيع','price','number',0,'step="0.01" min="0"')+'</div>';}
if(kind==='new-material'){t='خامة جديدة';form='<div class="form-grid">'+inp('كود الخامة','code','text','','required')+inp('اسم الخامة','name','text','','required')+inp('التصنيف','category')+sel('الوحدة','unit',['متر','كيلو','قطعة','رول'].map(x=>[x,x]))+'</div>';}
if(kind==='new-receipt'){t='استلام خامة';form='<div class="form-grid">'+sel('الخامة','materialId',db.materials.map(m=>[m.id,m.name+' ('+m.code+')']))+inp('الكمية','quantity','number','','required min="0.0001" step="0.0001"')+inp('تكلفة الوحدة','unitCost','number','','required min="0" step="0.01"')+inp('مرجع التوريد','reference')+'</div>';}
if(kind==='new-worker'){t='عامل جديد';form='<div class="form-grid">'
  +inp('كود العامل','code','text','','required')+inp('الاسم','name','text','','required')
  +inp('التخصص','role','text','خياطة')+inp('أجر القطعة','rate','number',0,'required min="0" step="0.01"')+'</div>';}
if(kind==='new-roll'){t='استلام رول قماش';form='<div class="form-grid">'
  +sel('القماش','materialId',db.materials.filter(m=>m.unit==='متر').map(m=>[m.id,m.name+' ('+m.code+')']))
  +inp('رقم الرول','rollNo','text','','required')+inp('درجة الصبغة / اللون','shade')
  +inp('عرض القماش (سم)','width','number','','min="0.01" step="0.01"')
  +inp('الطول (متر)','quantity','number','','required min="0.0001" step="0.0001"')
  +inp('تكلفة المتر','unitCost','number',0,'required min="0" step="0.01"')+'</div>';}
if(kind==='stage-work'){let o=order(modal.id);t='تسجيل دفعة: '+esc(labels[o?.status]);
  form='<input type="hidden" name="orderId" value="'+esc(o?.id)+'"><div class="form-grid">'
  +sel('العامل','workerId',db.workers.filter(w=>w.active).map(w=>[w.id,w.name+' ('+w.code+')']))
  +inp('عدد القطع','quantity','number','','required min="1" step="1"')
  +inp('مرجع دفعة المرحلة','batchRef')+'</div>'
  +'<p class="tips">تم تسجيل '+num(stageProgress(db,o.id,o.status).quantity)+' من '+num(stageTargetQuantity(o))
  +' قطعة، والتكلفة تحسب من أجر القطعة المحدد للعامل.</p>';}
if(kind==='matrix-order'){
  const chosen=db.styles.find(s=>s.id===(modal.id||db.styles[0]?.id))||db.styles[0];
  t='دفعة إنتاج للمقاسات والألوان';
  form='<label class="field">الموديل<select name="styleId" required><option value="">اختر...</option>'
    +db.styles.map(s=>'<option value="'+esc(s.id)+'" '+(s.id===chosen?.id?'selected':'')+'>'+esc(s.code+' — '+s.name)+'</option>').join('')
    +'</select></label>'
    +'<p class="tips">حدد كمية كل مقاس ولون. الخانات الفارغة أو الصفرية لا تنشئ أوامر. تُنشأ أوامر مستقلة مرتبطة بدفعة واحدة.</p>'
    +(chosen
      ?'<div class="table-wrap matrix-scroll"><table><thead><tr><th>SKU</th><th>المقاس</th><th>اللون</th><th>الكمية</th></tr></thead><tbody>'
        +chosen.variants.map(v=>'<tr>'+td('<span class="mono">'+esc(v.sku)+'</span>')
          +td(esc(v.size))+td(esc(v.color))+td('<input class="matrix-input" type="number" name="matrix_'+esc(v.id)+'" min="0" max="100000" step="1" value="" placeholder="0" aria-label="كمية '+esc(v.size+' '+v.color)+'">')+'</tr>').join('')
        +'</tbody></table></div>'
      :'<p class="alert">يجب إضافة موديل أولًا</p>')
    +'<div class="form-grid">'+inp('العميل','customer')+inp('موعد التسليم','due','date')+'</div>';
}
if(kind==='new-bundle'){
  const o=order(modal.id);
  const progress=o?cuttingBundleStats(db,o.id):{total:0};
  t='إضافة حزمة قص — '+esc(o?.ref);
  form='<input type="hidden" name="orderId" value="'+esc(o?.id)+'">'
    +'<p class="tips">الإجمالي '+num(progress.total)+' من '+num(o?.qty)+' قطعة. يجب استكمال حزم القص قبل بدء صرف الخامات.</p>'
    +'<div class="form-grid">'+inp('رقم الحزمة','bundleNo','text','','required maxlength="50"')
    +inp('عدد القطع','quantity','number','','required min="1" step="1"')
    +inp('ملاحظات','notes')+'</div>';
}

if(kind==='new-wholesale'){
  const chosen=db.styles.find(s=>s.id===(modal.id||db.styles[0]?.id))||db.styles[0];
  t='إنشاء طلب بيع جملة';
  form='<label class="field">الموديل<select name="styleId" required><option value="">اختر...</option>'
    +db.styles.map(s=>'<option value="'+esc(s.id)+'" '+(s.id===chosen?.id?'selected':'')+'>'+esc(s.code+' — '+s.name)+'</option>').join('')
    +'</select></label>'
    +'<p class="tips">حدد الكمية المطلوبة من كل مقاس ولون. لا يتم حجز مخزون التام عند إنشاء الطلب، بل عند إصدار إذن التسليم.</p>'
    +(chosen
      ?'<div class="table-wrap matrix-scroll"><table><thead><tr><th>SKU</th><th>المقاس</th><th>اللون</th><th>الكمية</th><th>المتاح الآن</th></tr></thead><tbody>'
        +chosen.variants.map(v=>'<tr>'+td('<span class="mono">'+esc(v.sku)+'</span>')
          +td(esc(v.size))+td(esc(v.color))+td('<input class="matrix-input" type="number" name="sell_'+esc(v.id)+'" min="0" max="1000000" step="1" placeholder="0" aria-label="كمية '+esc(v.size+' '+v.color)+'">')
          +td(num(availableFinishedStock(db,v.id)))+'</tr>').join('')+'</tbody></table></div>'
      :'<p class="alert">عرّف موديلًا أولًا.</p>')
    +'<div class="form-grid">'+inp('اسم العميل','customer','text','','required maxlength="120"')
    +inp('موعد التسليم','due','date')+'</div>';
}
if(kind==='ship-wholesale'){
  const o=db.wholesaleOrders.find(x=>x.id===modal.id);
  if(!o)return '';
  const p=wholesaleProgress(db,o);
  t='إذن تسليم — '+esc(o.ref);
  form='<input type="hidden" name="orderId" value="'+esc(o.id)+'">'
    +'<p class="tips">كل كمية تُخصم من مخزون التام بعد الحفظ. لا تتجاوز المتبقي من الطلب أو المتاح من الصنف.</p>'
    +inp('مرجع إذن التسليم','reference','text','','required maxlength="60"')
    +'<div class="table-wrap matrix-scroll"><table><thead><tr><th>SKU</th><th>المتبقي من الطلب</th><th>المتاح بالمخزن</th><th>الكمية المسلمة</th></tr></thead><tbody>'
    +p.lines.filter(l=>l.remaining>0).map(l=>'<tr>'
      +td('<span class="mono">'+esc(l.sku)+'</span>')
      +td(num(l.remaining))+td(num(availableFinishedStock(db,l.variantId)))
      +td('<input class="matrix-input" type="number" name="ship_'+esc(l.variantId)+'" min="0" max="'+Math.min(l.remaining,Math.max(0,availableFinishedStock(db,l.variantId)))+'" step="1" placeholder="0" aria-label="تسليم '+esc(l.sku)+'">')+'</tr>').join('')
    +'</tbody></table></div>';
}

if(kind==='new-cloud-intake'){
  t='طلب عميل سحابي جديد';
  form='<p class="tips">سيرسل هذا الطلب إلى قاعدة المصنع مباشرة، ولا يغيّر مخزون المتصفح. أدخل بندًا في كل سطر بالترتيب التالي:</p>'
    +'<p class="notes"><code>SKU | المقاس | اللون | الكمية | السعر</code></p>'
    +'<div class="form-grid">'+inp('اسم العميل','customerName','text','','required maxlength="120"')
    +inp('الهاتف أو وسيلة التواصل','customerContact','text','','maxlength="160"')+'</div>'
    +'<label class="field">بنود الطلب<textarea name="linesRaw" rows="6" class="intake-lines" required placeholder="SH-100-M-BLACK | M | أسود | 12 | 350\nSH-100-L-BLACK | L | أسود | 8 | 350"></textarea></label>'
    +'<label class="field">ملاحظات<textarea name="notes" rows="3" class="intake-lines" maxlength="1000"></textarea></label>';
}
if(kind==='new-order'){t='أمر إنتاج جديد';form='<div class="form-grid">'+sel('الموديل','styleId',db.styles.map(s=>[s.id,s.code+' - '+s.name]))+sel('المقاس واللون','variantId',[])+inp('عدد القطع','quantity','number','','required min="1" step="1"')+inp('العميل','customer')+inp('موعد التسليم','due','date')+'</div><p class="tips">لا يتم صرف الخامات إلا عند بدء القص.</p>';}
if(kind==='bom'){let s=style(modal.id);t='مكونات BOM - '+s.code;form='<p class="notes">أدخل الاستهلاك المطلوب لكل قطعة</p>'+db.materials.map(m=>'<label class="bom-line"><span>'+esc(m.name)+' · '+esc(m.unit)+'</span><input type="number" name="bom_'+m.id+'" step="0.0001" min="0" value="'+(s.bom.find(b=>b.materialId===m.id)?.qty||'')+'"></label>').join('');}
if(kind==='quality'){let o=order(modal.id);t='فحص جودة - '+o.ref;form='<p class="tips">كمية الأمر '+num(o.qty)+' قطعة. لا يكتمل إلا بمساواة المقبول + المرفوض للكمية.</p><div class="form-grid">'+inp('مقبول','good','number',o.good,'min="0" step="1" required')+inp('مرفوض','reject','number',o.reject,'min="0" step="1" required')+inp('أجور تشغيل إضافية','labor','number',o.labor,'min="0" step="0.01"')+inp('تكاليف إضافية','overhead','number',o.overhead,'min="0" step="0.01"')+'</div>';}
return '<div class="modal-bg" id="backdrop"><div class="modal" role="dialog" aria-modal="true"><div class="modal-h"><h2>'+t+'</h2>'+btn('×','close')+'</div><form id="entry"><div class="modal-b">'+form+'</div><div class="modal-f">'+btn('إلغاء','close')+'<button type="submit" class="btn primary">حفظ البيانات</button></div></form></div></div>';}
function navigate(id){page=id;detail=null;modal=null;search='';location.hash='#/'+id;render();}
function open(type,oid=''){modal={type,id:oid};render();if(type==='new-order')setVariants();if(type==='new-receipt'&&oid){let field=document.querySelector('[name=materialId]');if(field)field.value=oid;}}
function setVariants(){let sid=document.querySelector('[name=styleId]')?.value;let e=document.querySelector('[name=variantId]');if(e)e.innerHTML='<option value="">اختر المقاس واللون...</option>'+(style(sid)?.variants||[]).map(v=>'<option value="'+v.id+'">'+esc(v.size)+' / '+esc(v.color)+'</option>').join('');}
function seed(){
  if(!isDemoEligible(db)){toast('بيانات العرض لا تُضاف إلا إلى متصفح فارغ؛ احفظ بياناتك ولا تخلطها بالتجربة.',true);return;}
  if(!confirm('سيتم إنشاء بيانات افتراضية مترابطة لكل شاشات المصنع على هذا المتصفح فقط. لا تستخدمها كبيانات فعلية للعميل. متابعة؟'))return;
  mutator(d=>populateDemoData(d,{newMaterial,newStyle,receive,setBom,newOrder,advance,quality}),
    'تم تجهيز بيانات تجريبية تغطي جميع شاشات المصنع');
}

if(typeof document!=='undefined') {
function downloadSnapshot(data, fileName){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download=fileName;anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function refreshCloudIntake(){
  cloudIntakeMessage='جارٍ تحميل بيانات المصنع والطلبات...';render();
  try{
    const factories=await cloudFactoryList();
    cloudFactoriesState=factories;
    cloudFactorySelected=factories[0]?.id||'';
    cloudIntakeState=cloudFactorySelected?await cloudIntakeOrders(cloudFactorySelected):[];
    cloudIntakeMessage=factories.length?'تم تحميل الطلبات من قاعدة البيانات.':'لا توجد عضوية مصنع مرتبطة بهذا الحساب.';
  }catch(err){cloudIntakeMessage=err.message||'تعذر قراءة بيانات المصنع';cloudIntakeState=[];}
  render();
}
function handleCloudAction(action){
  if(action==='cloud-logout'){
    cloudLogout();cloudFactoriesState=[];cloudIntakeState=[];cloudFactorySelected='';cloudIntakeMessage='';render();toast('تم تسجيل الخروج من النسخ السحابي');return;
  }
  if(action==='cloud-login'){
    const email=document.getElementById('cloud-email')?.value;
    const password=document.getElementById('cloud-password')?.value;
    cloudLogin(email,password)
      .then(()=>{render();toast('تم تسجيل الدخول للحساب السحابي');if(page==='cloud-intake')refreshCloudIntake();})
      .catch(err=>toast(err.message||'تعذر تسجيل الدخول',true));
    return;
  }
  if(action==='cloud-save'){
    if(db.demoMode){toast('النسخ السحابي معطّل لبيانات العرض. استخدم تصدير JSON المحلي فقط.',true);return;}
    if(!confirm('سيتم استبدال النسخة السحابية الخاصة بحسابك ببيانات هذا الجهاز. هل تريد المتابعة؟'))return;
    const snapshot=structuredClone(db);
    cloudSave(snapshot)
      .then(()=>toast('تم تأكيد حفظ النسخة السحابية'))
      .catch(err=>toast(err.message||'فشل النسخ السحابي',true));
    return;
  }
  if(action==='cloud-restore'){
    cloudLoad().then(snapshot=>{
      if(!snapshot) {toast('لا توجد نسخة سحابية لهذا الحساب');return;}
      if(!confirm('سيتم استبدال بيانات هذا الجهاز بالنسخة السحابية. سيتم تنزيل ملف احتياطي من بيانات الجهاز قبل الاستبدال. متابعة؟'))return;
      const next=validateCloudSnapshot(snapshot.data);
      validateWholesaleLedger(next);
      downloadSnapshot(db,'garments-before-cloud-restore.json');
      localStorage.setItem(KEY,JSON.stringify(next));
      db=next;render();toast('تم استرجاع النسخة السحابية');
    }).catch(err=>toast(err.message||'تعذر استرجاع النسخة',true));
  }
}
document.addEventListener('click',e=>{let b=e.target.closest('[data-act]');if(!b){if(e.target.id==='backdrop'){modal=null;render();}return;}let a=b.dataset.act,oid=b.dataset.id;if(a==='nav'){navigate(oid);if(oid==='cloud-intake'&&cloudIdentity())refreshCloudIntake();}else if(a==='cloud-intake-refresh')refreshCloudIntake();else if(['new-style','new-material','new-receipt','new-roll','new-worker','stage-work','new-order','matrix-order','new-bundle','new-wholesale','ship-wholesale','new-cloud-intake','view-cloud-intake','bom','quality'].includes(a))open(a,oid);else if(a==='receipt-for')open('new-receipt',oid);else if(a==='close'){modal=null;render();}else if(a==='show-style'){detail=oid;page='style-detail';render();}else if(a==='show-order'){detail=oid;page='order-detail';render();}else if(a==='show-batch'){detail=oid;page='batch-detail';render();}else if(a==='show-wholesale'){detail=oid;page='wholesale-detail';render();}else if(a==='advance'){if(confirm(order(oid).status==='planned'?'سيتم خصم الخامات الآن، هل تؤكد؟':'تأكيد الانتقال للمرحلة التالية؟'))mutator(d=>advance(d,oid),'تم تحديث مرحلة الإنتاج');}else if(['cloud-login','cloud-logout','cloud-save','cloud-restore'].includes(a))handleCloudAction(a);else if(a==='seed')seed();else if(a==='reset'){if(confirm('سيتم حذف كل البيانات المحلية، هل تؤكد؟')&&confirm('تأكيد نهائي لحذف كل البيانات؟'))mutator(d=>{Object.assign(d,fresh());},'تم مسح البيانات');}else if(a==='export'){downloadSnapshot(db,'premieros-garments-backup.json');toast('تم بدء تنزيل نسخة البيانات');}});
document.addEventListener('change',async e=>{if(e.target.matches('[name=styleId]')&&modal?.type==='new-order')setVariants();if(e.target.matches('[name=styleId]')&&['matrix-order','new-wholesale'].includes(modal?.type)){modal.id=e.target.value;render();}if(e.target.id==='import'&&e.target.files[0]){try{let value=JSON.parse(await e.target.files[0].text());if(value.version!==1||!['styles','materials','orders','ledger','finished','audit'].every(k=>Array.isArray(value[k])))throw Error('ملف غير متوافق');ensureFactoryState(value);ensureWholesaleState(value);validateWholesaleLedger(value);if(value.materials.some(m=>!Number.isFinite(m.stock)||m.stock<0)||value.fabricRolls.some(r=>!Number.isFinite(r.remaining)||r.remaining<0||r.remaining>r.received))throw Error('النسخة تحتوي على أرصدة غير صحيحة');if(confirm('استبدال جميع البيانات الحالية من النسخة الاحتياطية؟')){localStorage.setItem(KEY,JSON.stringify(value));db=value;render();toast('تم الاستيراد');}}catch(err){toast(err.message,true);}}});
document.addEventListener('submit',e=>{if(e.target.id!=='entry')return;e.preventDefault();let f=new FormData(e.target),type=modal.type,oid=modal.id;if(type==='new-cloud-intake'){
  try{
    if(db.demoMode)throw Error('عطّل بيانات العرض المحلية قبل إدخال طلبات فعلية');
    if(!cloudFactorySelected)throw Error('يجب تحميل عضوية المصنع أولًا');
    const payload=buildIntakeOrder(f);
    cloudCreateIntakeOrder(cloudFactorySelected,payload).then(()=>{
      modal=null;toast('تم حفظ طلب العميل في قاعدة المصنع');refreshCloudIntake();
    }).catch(err=>toast(err.message||'فشل حفظ الطلب',true));
  }catch(err){toast(err.message||'بيانات طلب غير صحيحة',true);}
}else if(type==='new-style')mutator(d=>newStyle(d,f),'تم إنشاء الموديل');else if(type==='new-material')mutator(d=>newMaterial(d,f),'تم تعريف الخامة');else if(type==='new-receipt')mutator(d=>receive(d,f),'تم استلام الخامات');else if(type==='new-order')mutator(d=>newOrder(d,f),'تم إنشاء أمر التصنيع');else if(type==='matrix-order')mutator(d=>createProductionMatrix(d,f),'تم إنشاء دفعة المقاسات والألوان');else if(type==='new-bundle')mutator(d=>addCuttingBundle(d,f),'تم تسجيل حزمة القص');else if(type==='new-wholesale')mutator(d=>createWholesaleOrder(d,f),'تم إنشاء طلب الجملة');else if(type==='ship-wholesale')mutator(d=>dispatchWholesaleOrder(d,f),'تم تسجيل إذن التسليم وخصم مخزون التام');else if(type==='bom')mutator(d=>setBom(d,oid,f),'تم حفظ قائمة المكونات');else if(type==='quality')mutator(d=>quality(d,oid,f),'تم تسجيل الجودة');else if(type==='new-worker')mutator(d=>addWorker(d,f),'تم تسجيل العامل');else if(type==='new-roll')mutator(d=>receiveFabricRoll(d,f),'تم استلام الرول');else if(type==='stage-work')mutator(d=>registerStageWork(d,f),'تم تسجيل إنتاج العامل');});
document.addEventListener('input',e=>{if(e.target.id==='search'){let pos=e.target.selectionStart;search=e.target.value;render();let input=document.getElementById('search');input.focus();input.setSelectionRange(pos,pos);}});
window.addEventListener('hashchange',()=>{let newPage=location.hash.replace('#/','');if(newPage!==page&&views[newPage]){page=newPage;detail=null;render();}});
render();
}

export const __test={ensureWholesaleState,createWholesaleOrder,dispatchWholesaleOrder,availableFinishedStock,wholesaleProgress,wholesaleOverview,validateWholesaleLedger,fresh,newStyle,newMaterial,receive,setBom,newOrder,advance,quality,ensureFactoryState,addWorker,registerStageWork,pieceworkCost,stageProgress,receiveFabricRoll,allocateFabricRolls,createProductionMatrix,productionBatches,addCuttingBundle,cuttingBundleStats,requireCuttingBundleBalance};
