/* White tex Smart Workflow — checklist-based operational handoffs.
 * Existing order.stage status remains the single source of truth.
 * Checklists are confirmations, never fabricated production quantity.
 */
import { stages, labels, stageTargetQuantity, workStages } from './workflow.mjs';
import { stageProgress } from './factory-ops.mjs';
import { cuttingBundleStats } from './production-planning.mjs';
const now=()=>new Date().toISOString();
const makeId=()=>globalThis.crypto?.randomUUID?.()||'TASK-'+Date.now()+'-'+Math.random().toString(36).slice(2);
export const STATION_STAGES=Object.freeze(stages.filter(x=>x!=='completed'));
export const STATION_LABELS=Object.freeze({...labels,planned:'تجهيز القص'});
export const STATION_TASKS=Object.freeze({
  planned:[
    ['spec','مراجعة المنتج والمقاس واللون المطلوب'],
    ['materials','التأكد من جاهزية الخامات والكميات'],
    ['plan','مراجعة الحزم أو خطة القص قبل البدء']
  ],
  cutting:[
    ['receive','استلام الخامات وأمر التشغيل'],
    ['cut','التأكد من إتمام قص الكمية المطلوبة'],
    ['sort','مطابقة المقاسات والألوان وعدد القطع'],
    ['handoff','تجهيز القطع لتسليم الفرز']
  ],
  initial_sorting:[
    ['receive','استلام القطع من القص ومراجعة العدد'],
    ['classify','فرز القطع حسب المقاس واللون'],
    ['defects','عزل أي قطع تحتاج إعادة مراجعة'],
    ['handoff','تجهيز التسليم إلى خط الإنتاج']
  ],
  production_line:[
    ['receive','استلام الدفعة ومراجعة العدد'],
    ['route','توزيع قطع الدفعة على نقاط التشغيل'],
    ['inspect','مراجعة تنفيذ المرحلة والكميات'],
    ['handoff','تجهيز القطع لقسم الخياطة']
  ],
  sewing:[
    ['receive','استلام القطع من خط الإنتاج'],
    ['sew','استكمال الخياطة المطلوبة للموديل'],
    ['inspect','مطابقة الخياطة والعدد'],
    ['handoff','تسليم القطع للتشطيب']
  ],
  finishing:[
    ['receive','استلام القطع بعد الخياطة'],
    ['trim','التأكد من التشطيب وإزالة الزوائد'],
    ['inspect','مراجعة المظهر والعدد'],
    ['handoff','تجهيز القطع لفحص الجودة']
  ],
  quality:[
    ['receive','استلام الدفعة وإجراء فحص الجودة'],
    ['record','تسجيل عدد المقبول والمرفوض في النظام'],
    ['inspect','مطابقة نتيجة الجودة مع إجمالي القطع'],
    ['handoff','اعتماد تسليم القطع المقبولة للطباعة']
  ],
  printing:[
    ['receive','استلام القطع المقبولة من الجودة'],
    ['print','إنهاء الطباعة حسب مواصفات الموديل'],
    ['inspect','التأكد من جودة الطباعة والعدد'],
    ['handoff','تجهيز التسليم إلى المكواة']
  ],
  ironing:[
    ['receive','استلام القطع المطبوعة'],
    ['iron','إنهاء الكي والتجهيز'],
    ['inspect','مراجعة الشكل والعدد'],
    ['handoff','تجهيز القطع لجودة البرزنتيشن']
  ],
  presentation_quality:[
    ['receive','استلام القطع بعد المكواة'],
    ['inspect','فحص المظهر النهائي والعرض'],
    ['count','مطابقة عدد القطع المقبولة'],
    ['handoff','اعتماد الإرسال إلى التعبئة']
  ],
  packing:[
    ['receive','استلام قطع المنتج الجاهزة'],
    ['pack','تعبئة وتجهيز كل القطع المقبولة'],
    ['count','مطابقة عدد العبوات والقطع'],
    ['handoff','اعتماد استلام مخزن التام']
  ]
});
export function ensureStationState(db){
  if(db.stageChecklists===undefined)db.stageChecklists=[];
  if(!Array.isArray(db.stageChecklists))throw Error('سجل مهام المراحل غير متوافق');
  return db;
}
export function validateStationState(db){
  ensureStationState(db);
  const orders=new Map((db.orders||[]).map(o=>[o.id,o]));
  const seen=new Set();
  for(const row of db.stageChecklists){
    if(!row||typeof row.id!=='string'||!row.id||typeof row.orderId!=='string'
      ||!orders.has(row.orderId)||!STATION_STAGES.includes(row.stage)
      ||!Array.isArray(row.done)||typeof row.updatedAt!=='string'
      ||new Set(row.done).size!==row.done.length
      ||row.done.some(key=>typeof key!=='string'||!STATION_TASKS[row.stage].some(task=>task[0]===key)))
      throw Error('قائمة مهام مرحلة غير صحيحة');
    const pair=row.orderId+':'+row.stage;
    if(seen.has(pair))throw Error('قائمة مهام مكررة لنفس المرحلة');
    seen.add(pair);
  }
  for(const order of orders.values()){
    if(order.smartWorkflow!==undefined&&typeof order.smartWorkflow!=='boolean')
      throw Error('إعداد التشغيل التفاعلي غير صحيح');
  }
  return db;
}
const current=(db,orderId,stage)=>db.stageChecklists?.find(x=>x.orderId===orderId&&x.stage===stage);
export function stageChecklist(db,order){
  const tasks=STATION_TASKS[order.status]||[];
  const saved=current(db,order.id,order.status);
  const checked=new Set(saved?.done||[]);
  const complete=tasks.length>0&&tasks.every(([id])=>checked.has(id));
  return {tasks:tasks.map(([id,label])=>({id,label,done:checked.has(id)})),
    done:tasks.filter(([id])=>checked.has(id)).length,total:tasks.length,complete};
}
export function enableSmartWorkflow(db,orderId){
  ensureStationState(db);
  const order=(db.orders||[]).find(o=>o.id===orderId);
  if(!order||!STATION_STAGES.includes(order.status))throw Error('لا يوجد أمر تشغيل صالح');
  order.smartWorkflow=true;
  if(!current(db,order.id,order.status))
    db.stageChecklists.push({id:makeId(),orderId:order.id,stage:order.status,done:[],updatedAt:now()});
  return order;
}
export function toggleStageTask(db,orderId,taskId,checked){
  if(typeof checked!=='boolean')throw Error('حالة المهمة غير صحيحة');
  const order=enableSmartWorkflow(db,orderId);
  if(!STATION_TASKS[order.status].some(([id])=>id===taskId))throw Error('مهمة غير معروفة لهذه المرحلة');
  const row=current(db,order.id,order.status);
  const done=new Set(row.done);
  if(checked)done.add(taskId);else done.delete(taskId);
  row.done=[...done];row.updatedAt=now();
  return stageChecklist(db,order);
}
export function requireStageChecklist(db,order){
  if(!order.smartWorkflow)return; // Legacy orders retain the existing progression behavior.
  if(!stageChecklist(db,order).complete)
    throw Error('استكمل جميع مهام '+(STATION_LABELS[order.status]||'المرحلة')+' قبل التسليم');
}
export function stationReadiness(db,order){
  const checklist=stageChecklist(db,order);
  const quantity=stageTargetQuantity(order);
  const progress=workStages.includes(order.status)?stageProgress(db,order.id,order.status):null;
  const issues=[];
  if(order.status==='planned'){
    const model=db.styles?.find(x=>x.id===order.styleId);
    if(!model?.bom?.length)issues.push('حدّد الخامات المطلوبة للموديل قبل بدء القص');
    else for(const item of model.bom){
      const mat=db.materials.find(x=>x.id===item.materialId);
      const needed=order.qty*item.qty;
      if(!mat||mat.stock+0.000001<needed){
        issues.push('كمية الخامة '+(mat?.name||'غير معروفة')+' غير كافية');break;
      }
    }
    const bundles=cuttingBundleStats(db,order.id);
    if(bundles.rows.length&&bundles.total!==order.qty)
      issues.push('حزم القص المسجلة: '+bundles.total+' من '+order.qty);
  }
  if(order.status==='quality'&&!(order.good>0&&order.good+order.reject===order.qty))
    issues.push('سجّل المقبول والمرفوض بالكامل قبل تسليم القطع');
  if(progress?.records>0&&progress.quantity!==quantity)
    issues.push('إنتاج العامل المسجّل: '+progress.quantity+' من '+quantity);
  return {checklist,quantity,progress,issues,
    ready:order.smartWorkflow&&checklist.complete&&issues.length===0};
}
export function stationOverview(db,stage){
  if(!STATION_STAGES.includes(stage))throw Error('مرحلة غير معروفة');
  const orders=(db.orders||[]).filter(x=>x.status===stage).sort((a,b)=>
    (a.due||'9999').localeCompare(b.due||'9999'));
  const prepared=orders.map(order=>({order,readiness:stationReadiness(db,order)}));
  return {stage,label:STATION_LABELS[stage],entries:prepared,
    waiting:prepared.filter(x=>x.readiness.checklist.done===0).length,
    inProgress:prepared.filter(x=>x.readiness.checklist.done>0&&!x.readiness.ready).length,
    ready:prepared.filter(x=>x.readiness.ready).length,
    pieces:orders.reduce((sum,o)=>sum+stageTargetQuantity(o),0),
    late:orders.filter(o=>o.due&&o.due<new Date().toISOString().slice(0,10)).length};
}
