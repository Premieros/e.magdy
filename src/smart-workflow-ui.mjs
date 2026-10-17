/* One operational screen per phase, plus a central operations room. */
import { stages,labels,workStages } from './workflow.mjs';
import { STATION_STAGES,STATION_LABELS,stationOverview } from './smart-workflow.mjs';
export const STATION_ROUTE=stage=>'station-'+stage;
const stageButton=(label,action,id,disabled=false,extra='')=>
  '<button type="button" class="btn '+(disabled?'wt-station-disabled':'primary')+'" data-act="'+action+'" data-id="'+id+'" '+(disabled?'disabled aria-disabled="true"':'')+' '+extra+'>'+label+'</button>';
const dateValue=(day)=>day&&/^\d{4}-\d{2}-\d{2}$/.test(day)?day:'—';
const today=()=>{
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
};
const completedToday=(db,stage)=>{
  const next=stages[stages.indexOf(stage)+1];
  return (db.orders||[]).filter(o=>(o.history||[]).some(h=>{
    const at=h.at?new Date(h.at):null;
    return h.stage===next&&at&&!Number.isNaN(at.valueOf())&&
      [at.getFullYear(),String(at.getMonth()+1).padStart(2,'0'),String(at.getDate()).padStart(2,'0')].join('-')===today();
  })).length;
};
export function operationsRoom(db,{heading,btn,metric,esc,num}){
  const stats=STATION_STAGES.map(stage=>stationOverview(db,stage));
  const active=(db.orders||[]).filter(x=>STATION_STAGES.includes(x.status)).length;
  const done=(db.orders||[]).filter(x=>x.status==='completed').length;
  const late=stats.reduce((n,x)=>n+x.late,0);
  const totalReady=stats.reduce((n,x)=>n+x.ready,0);
  return heading('غرفة العمليات','متابعة لحظية لحركة أوامر التشغيل، وما ينتظر كل قسم، من بيانات المصنع الفعلية.',
    btn('عرض أوامر الإنتاج','nav','orders'))
    +'<section class="wt-smart-hero"><div><small>WHITE TEX · SMART WORKFLOW</small><h2>كل قسم يعرف شغله، وكل مرحلة لها تسليم واضح</h2>'
    +'<p>افتح لوحة القسم لمراجعة الأوامر الواردة، إنهاء المهام، وتسليم الدفعة للقسم التالي.</p></div>'
    +'<span class="wt-smart-live"><span class="wt-smart-ping"></span> بيانات التشغيل الحالية</span></section>'
    +'<div class="wt-smart-kpis">'
    +metric('أوامر داخل التشغيل',num(active),'الأوامر التي لم تنتهِ')
    +metric('جاهزة للتسليم',num(totalReady),'اكتملت مهامها والشروط المطلوبة')
    +metric('متأخرة عن التسليم',num(late),'أوامر بتاريخ تسليم سابق')
    +metric('أوامر مكتملة',num(done),'أنهت جميع المراحل')
    +'</div>'
    +'<section class="card"><h3>مراحل سير الإنتاج</h3>'
    +'<p class="sub">الأعداد مأخوذة من المرحلة الحالية لكل أمر. اضغط أي قسم لفتح شاشة مهامه.</p>'
    +'<div class="wt-smart-station-grid">'+stats.map((s,i)=>
      '<button type="button" class="wt-smart-stage-tile" data-act="open-station" data-id="'+esc(s.stage)+'">'
      +'<span class="wt-smart-tile-num">'+String(i+1).padStart(2,'0')+'</span>'
      +'<span class="wt-smart-tile-copy"><strong>'+esc(s.label)+'</strong><small>'+num(s.entries.length)+' أمر · '+num(s.pieces)+' قطعة</small></span>'
      +'<span class="wt-smart-tile-count">'+num(s.ready)+' جاهز</span><span aria-hidden="true">←</span></button>'
    ).join('')+'</div></section>'
    +'<p class="tips">المؤشرات حقيقية وليست أرقامًا تجريبية. المهام علامة اعتماد من القسم، ولا تغني عن إدخال الإنتاج أو تسجيل الجودة عند الحاجة. صفحة الموقع متاحة دون تسجيل دخول كما كانت.</p>';
}
export function stationScreen(db,stage,{heading,btn,metric,esc,num}){
  const stat=stationOverview(db,stage);
  const currentIndex=STATION_STAGES.indexOf(stage);
  const future=STATION_STAGES[currentIndex+1];
  const rows=stat.entries.map(({order:o,readiness:r})=>{
    const model=(db.styles||[]).find(m=>m.id===o.styleId);
    const variant=model?.variants?.find(v=>v.id===o.variantId);
    const tasks=r.checklist.tasks;
    const pct=tasks.length?Math.round(r.checklist.done/tasks.length*100):0;
    const stageTarget=r.quantity;
    const work=r.progress;
    const checks=tasks.map(task=>
      '<label class="wt-smart-check '+(task.done?'wt-smart-checked':'')+'">'
      +'<input type="checkbox" data-smart-task="1" data-order="'+esc(o.id)+'" data-task="'+esc(task.id)+'" '+(task.done?'checked':'')+'>'
      +'<span>'+esc(task.label)+'</span><span class="wt-smart-checkmark" aria-hidden="true">✓</span></label>').join('');
    return '<article class="wt-smart-order '+(r.ready?'wt-smart-ready':'')+'">'
      +'<div class="wt-smart-order-head"><div><span class="wt-smart-order-overline">'+esc(o.ref||'أمر تشغيل')+'</span>'
      +'<h3>'+esc(model?.name||'منتج غير محدد')+'</h3>'
      +'<p>'+esc(variant?.size||'—')+' · '+esc(variant?.color||'—')
      +(o.customer?' · '+esc(o.customer):'')+'</p></div>'
      +'<span class="wt-smart-order-state '+(r.ready?'wt-smart-state-ready':'')+'">'
      +(r.ready?'جاهز للتسليم':r.checklist.done?'جاري تنفيذ المهام':'بانتظار التنفيذ')+'</span></div>'
      +'<div class="wt-smart-order-facts"><div><small>الكمية المطلوبة</small><strong>'+num(stageTarget)+' قطعة</strong></div>'
      +'<div><small>التسليم المطلوب</small><strong>'+esc(dateValue(o.due))+'</strong></div>'
      +'<div><small>إنتاج العمال المسجّل</small><strong>'+(work?num(work.quantity)+' من '+num(stageTarget):'غير مطلوب لهذه المرحلة')+'</strong></div></div>'
      +'<div class="wt-smart-progress-head"><strong>قائمة مهام القسم</strong><span>'+r.checklist.done+' من '+r.checklist.total+' · '+pct+'٪</span></div>'
      +'<div class="wt-smart-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'" aria-label="نسبة المهام المكتملة"><span style="width:'+pct+'%"></span></div>'
      +'<div class="wt-smart-checklist">'+checks+'</div>'
      +(r.issues.length?'<div class="wt-smart-issues">'+r.issues.map(x=>'<p>⚠ '+esc(x)+'</p>').join('')+'</div>':'')
      +'<div class="wt-smart-order-actions">'
      +(stage==='planned'?btn('حزم القص','new-bundle',o.id):'')
      +(workStages.includes(stage)?btn('＋ تسجيل إنتاج','stage-work',o.id):'')
      +(stage==='quality'?btn('تسجيل فحص الجودة','quality',o.id):'')
      +btn('تفاصيل الأمر','show-order',o.id)
      +stageButton(stage==='packing'?'إنهاء التعبئة واستلام التام':'إنهاء المرحلة وتسليمها', 'smart-handoff',esc(o.id),!r.ready)
      +'</div>'
      +'<p class="wt-smart-order-tip">عند الاعتماد ينتقل الأمر تلقائيًا إلى '+esc(labels[stages[currentIndex+1]]||'مخزن التام')+'، وتُحدَّث أرقام القسم التالي.</p></article>';
  }).join('');
  return heading('شاشة '+stat.label,'الطلبات الواردة والمهام المطلوبة قبل تسليم الشغل إلى المرحلة التالية.',
      btn('غرفة العمليات','nav','operations')+(future?btn('القسم التالي: '+STATION_LABELS[future],'open-station',future):''))
    +'<div class="wt-smart-kpis">'
    +metric('وارد القسم',num(stat.entries.length),'أوامر تنتظر التنفيذ')
    +metric('جاري العمل',num(stat.inProgress),'بدأت مراجعة مهامها')
    +metric('جاهز للتسليم',num(stat.ready),'كل المهام والشروط مكتملة')
    +metric('تم تسليمها اليوم',num(completedToday(db,stage)),'انتقلت للمرحلة التالية اليوم')
    +'</div>'
    +'<div class="wt-smart-station-strip"><div><span class="wt-smart-ping"></span><strong>'+esc(stat.label)+'</strong>'
    +'<p>المطلوب الآن: '+num(stat.pieces)+' قطعة في '+num(stat.entries.length)+' أمر</p></div>'
    +'<div class="wt-smart-shortcuts">'+btn('عرض كل الأقسام','nav','operations')+(future?btn('فتح '+STATION_LABELS[future],'open-station',future):'')+'</div></div>'
    +(rows?'<div class="wt-smart-order-grid">'+rows+'</div>':
      '<section class="card wt-smart-empty"><span aria-hidden="true">✓</span><h3>لا توجد أوامر في القسم حاليًا</h3>'
      +'<p>الأوامر الجديدة ستظهر هنا بمجرد أن يسلّمها القسم السابق.</p>'+btn('متابعة غرفة العمليات','nav','operations','primary')+'</section>')
    +'<p class="tips">تُحفظ حالة مهام كل أمر ومرحلة في بيانات White tex والنسخ الاحتياطية. استكمال المهام لا يتجاوز قيود المخزون أو الجودة، ولا يتم تسليم المرحلة مرتين.</p>';
}
