import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __test as g } from '../app.js';
import { validateCloudSnapshot } from '../src/cloud-backup.mjs';
import { createProductionMatrix } from '../src/production-planning.mjs';
import { buildNotifications } from '../src/notifications.mjs';
import { translateText } from '../src/i18n.mjs';
import {
  STATION_STAGES,STATION_TASKS,ensureStationState,validateStationState,
  stageChecklist,enableSmartWorkflow,toggleStageTask,requireStageChecklist,stationReadiness,
  stationOverview
} from '../src/smart-workflow.mjs';
import { operationsRoom,stationScreen } from '../src/smart-workflow-ui.mjs';

const form=x=>{const f=new FormData();for(const [k,v] of Object.entries(x))f.set(k,String(v));return f;};
function started(smart=true){
  const db=g.fresh();
  g.newMaterial(db,form({name:'قطن',unit:'متر'}));
  g.receive(db,form({materialId:db.materials[0].id,quantity:150,unitCost:20}));
  g.newStyle(db,form({name:'قميص',sizes:'M',colors:'أسود',price:120}));
  const model=db.styles[0];
  g.setBom(db,model.id,form({['bom_'+db.materials[0].id]:2}));
  g.newOrder(db,form({styleId:model.id,variantId:model.variants[0].id,quantity:10,
    customer:'شركة مثال',due:'2026-12-25',smartWorkflow:smart?'1':'0'}));
  return db;
}
function finishChecklist(db,order){
  for(const [task] of STATION_TASKS[order.status])toggleStageTask(db,order.id,task,true);
}
const ctx={heading:(a,b,c)=>a+b+(c||''),btn:(a)=>a,metric:(a,b)=>a+b,
  esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;'),
  num:x=>String(x)};

test('each production stage has its own real order screen and 3+ checklist tasks',()=>{
  assert.equal(STATION_STAGES.length,11);
  assert.equal(new Set(STATION_STAGES).size,11);
  for(const stage of STATION_STAGES){
    assert.ok(Array.isArray(STATION_TASKS[stage])&&STATION_TASKS[stage].length>=3,stage);
    assert.equal(new Set(STATION_TASKS[stage].map(t=>t[0])).size,STATION_TASKS[stage].length);
    const db=g.fresh();
    const markup=stationScreen(db,stage,ctx);
    assert.match(markup,/لا توجد أوامر في القسم حاليًا/);
    assert.match(markup,/غرفة العمليات/);
  }
});
test('new smart order cannot start cutting without completing its planned checklist',()=>{
  const db=started(),o=db.orders[0],stock=db.materials[0].stock;
  assert.equal(o.smartWorkflow,true);
  assert.throws(()=>g.advance(db,o.id),/استكمل جميع مهام/);
  assert.equal(o.status,'planned');assert.equal(db.materials[0].stock,stock);
  toggleStageTask(db,o.id,'spec',true);
  assert.equal(stageChecklist(db,o).done,1);
  assert.equal(stationReadiness(db,o).ready,false);
  finishChecklist(db,o);
  assert.equal(stationReadiness(db,o).ready,true);
  const old=structuredClone(db);
  g.advance(db,o.id);
  assert.equal(o.status,'cutting');
  assert.equal(db.materials[0].stock,stock-20);
  assert.ok(buildNotifications(old,db).some(ev=>ev.title==='بدأ القص'));
});
test('cutting work stays visible until every task is acknowledged and stock is never consumed twice',()=>{
  const db=started(),o=db.orders[0];
  finishChecklist(db,o);g.advance(db,o.id);
  const materials=db.materials[0].stock;
  assert.equal(stationOverview(db,'cutting').entries.length,1);
  assert.equal(stationOverview(db,'initial_sorting').entries.length,0);
  assert.equal(stageChecklist(db,o).done,0);
  assert.throws(()=>g.advance(db,o.id),/مهام/);
  toggleStageTask(db,o.id,'receive',true);
  toggleStageTask(db,o.id,'cut',true);
  toggleStageTask(db,o.id,'cut',false);
  assert.equal(stageChecklist(db,o).done,1);
  assert.throws(()=>g.advance(db,o.id),/مهام/);
  finishChecklist(db,o);
  g.advance(db,o.id);
  assert.equal(o.status,'initial_sorting');
  assert.equal(db.materials[0].stock,materials);
  assert.equal(stationOverview(db,'cutting').entries.length,0);
  assert.equal(stationOverview(db,'initial_sorting').entries.length,1);
  assert.throws(()=>toggleStageTask(db,o.id,'cut',true),/غير معروفة/);
});
test('quality cannot hand off before accepted and rejected pieces are fully recorded',()=>{
  const db=started(),o=db.orders[0];
  while(o.status!=='quality'){finishChecklist(db,o);g.advance(db,o.id);}
  finishChecklist(db,o);
  assert.equal(stageChecklist(db,o).complete,true);
  assert.equal(stationReadiness(db,o).ready,false);
  assert.ok(stationReadiness(db,o).issues.some(x=>x.includes('المقبول')));
  assert.throws(()=>g.advance(db,o.id),/قبل مغادرة الجودة|المقبول/);
  g.quality(db,o.id,form({good:9,reject:1,labor:12,overhead:0}));
  assert.equal(stationReadiness(db,o).quantity,10);
  assert.equal(stationReadiness(db,o).ready,true);
  g.advance(db,o.id);
  assert.equal(o.status,'printing');
  assert.equal(stationReadiness(db,o).quantity,9);
  assert.equal(stageChecklist(db,o).done,0);
});
test('full journey: work order goes through all stages with tasks and packs finished stock exactly once',()=>{
  const db=started(),o=db.orders[0];
  while(o.status!=='completed'){
    if(o.status==='quality')g.quality(db,o.id,form({good:9,reject:1,labor:10,overhead:5}));
    finishChecklist(db,o);
    assert.equal(stationReadiness(db,o).ready,true,o.status);
    g.advance(db,o.id);
  }
  assert.equal(db.finished.length,1);
  assert.equal(db.finished[0].qty,9);
  assert.equal(o.history.length,12);
  assert.equal(db.stageChecklists.length,11);
  assert.equal(STATION_STAGES.every(stage=>db.stageChecklists.some(x=>x.stage===stage&&x.orderId===o.id)),true);
  assert.throws(()=>g.advance(db,o.id),/لا يمكن/);
});
test('real labor quantity still blocks stage handoff if workers recorded only part of target',()=>{
  const db=started(),o=db.orders[0];
  finishChecklist(db,o);g.advance(db,o.id);
  g.addWorker(db,form({name:'عامل قص',rate:2}));
  g.registerStageWork(db,form({orderId:o.id,workerId:db.workers[0].id,quantity:5}));
  finishChecklist(db,o);
  assert.ok(stationReadiness(db,o).issues.some(x=>x.includes('5 من 10')));
  assert.throws(()=>g.advance(db,o.id),/المسجل/);
  g.registerStageWork(db,form({orderId:o.id,workerId:db.workers[0].id,quantity:5}));
  assert.equal(stationReadiness(db,o).ready,true);
  g.advance(db,o.id);
  assert.equal(o.status,'initial_sorting');
});
test('legacy orders remain readable and only adopt checklists when employee checks a task',()=>{
  const db=started(false),o=db.orders[0];
  assert.equal(o.smartWorkflow,false);
  g.advance(db,o.id);
  assert.equal(o.status,'cutting');
  toggleStageTask(db,o.id,'receive',true);
  assert.equal(o.smartWorkflow,true);
  assert.throws(()=>g.advance(db,o.id),/استكمل/);
});
test('older cloud backups acquire stage checklist array without changing current orders',()=>{
  const db=started();delete db.stageChecklists;
  const restored=validateCloudSnapshot(db);
  assert.deepEqual(restored.stageChecklists,[]);
  assert.equal(restored.orders[0].status,'planned');
  assert.equal(restored.orders[0].smartWorkflow,true);
  ensureStationState(db);validateStationState(db);
});
test('corrupted or duplicated checklist snapshots cannot be restored',()=>{
  const db=started();finishChecklist(db,db.orders[0]);validateStationState(db);
  const dup=structuredClone(db);
  dup.stageChecklists.push({...dup.stageChecklists[0],id:'different'});
  assert.throws(()=>validateCloudSnapshot(dup),/مكررة/);
  const invalid=structuredClone(db);
  invalid.stageChecklists[0].done.push('invented_task');
  assert.throws(()=>validateCloudSnapshot(invalid),/غير صحيحة/);
});
test('matrix orders can opt into interactive task-based production',()=>{
  const db=started();
  const model=db.styles[0],v=model.variants[0];
  const matrix=form({styleId:model.id,['matrix_'+v.id]:2,smartWorkflow:'1'});
  createProductionMatrix(db,matrix);
  assert.equal(db.orders[0].smartWorkflow,true);
  assert.throws(()=>g.advance(db,db.orders[0].id),/مهام/);
});
test('interface links workstations and dynamic checkboxes without a new login page',()=>{
  const db=started();
  const room=operationsRoom(db,ctx);
  assert.match(room,/data-act="open-station"/);
  assert.match(room,/غرفة العمليات/);
  const station=stationScreen(db,'planned',ctx);
  assert.match(station,/data-smart-task="1"/);
  assert.match(station,/data-act="smart-handoff"/);
  assert.match(station,/disabled aria-disabled="true"/);
  finishChecklist(db,db.orders[0]);
  const ready=stationScreen(db,'planned',ctx);
  assert.doesNotMatch(ready,/disabled aria-disabled="true"/);
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(app,/toggleStageTask\(d,orderId,taskId,checked\)/);
  assert.match(app,/requireStageChecklist\(d,o\)/);
  assert.match(app,/data-smart-task/);
  assert.match(pages,/src\/smart-workflow\.mjs src\/smart-workflow-ui\.mjs/);
  assert.equal(translateText('غرفة العمليات','en'),'Operations Room');
});
