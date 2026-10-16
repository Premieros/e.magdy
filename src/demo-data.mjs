/* Fictional, browser-local showcase data for ALL factory screens.
 * Never inserted into Supabase or used as a source of customer records.
 * Use the exact same domain operations as the application.
 */
import { stages } from './workflow.mjs';
import { addWorker, receiveFabricRoll, registerStageWork } from './factory-ops.mjs';
import { createProductionMatrix, addCuttingBundle } from './production-planning.mjs';
import { createWholesaleOrder, dispatchWholesaleOrder, availableFinishedStock, validateWholesaleLedger } from './wholesale.mjs';

const form=fields=>{
  const f=new FormData();
  for(const [key,value] of Object.entries(fields))f.set(key,String(value));
  return f;
};
const dueIn=days=>{
  const d=new Date(Date.now()+days*86400000);
  return d.toISOString().slice(0,10);
};
const requiredCollections=[
  'styles','materials','orders','ledger','finished','workers','workLogs','fabricRolls',
  'cuttingBundles','wholesaleOrders','finishedDispatches'
];
export function isDemoEligible(db){
  return !db.demoMode && requiredCollections.every(key=>Array.isArray(db[key])&&db[key].length===0);
}
export function demoCoverage(db){
  const orders=db.orders||[];
  return {
    styles:db.styles?.length||0,
    sku:db.styles?.reduce((sum,s)=>sum+s.variants.length,0)||0,
    materials:db.materials?.length||0,
    rolls:db.fabricRolls?.length||0,
    workers:db.workers?.length||0,
    workLogs:db.workLogs?.length||0,
    orders:orders.length,
    lots:new Set(orders.filter(o=>o.batchId).map(o=>o.batchId)).size,
    bundles:db.cuttingBundles?.length||0,
    statuses:Object.fromEntries(stages
      .map(status=>[status,orders.filter(o=>o.status===status).length])),
    finished:db.finished?.length||0,
    sales:db.wholesaleOrders?.length||0,
    dispatches:db.finishedDispatches?.length||0,
    stock:db.styles?.flatMap(s=>s.variants)?.reduce((sum,v)=>
      sum+Math.max(0,availableFinishedStock(db,v.id)),0)||0,
    audit:db.audit?.length||0,
  };
}
export function populateDemoData(db,ops){
  if(!isDemoEligible(db))throw Error('تحميل بيانات العرض مسموح فقط على نسخة محلية فارغة. نزّل نسخة احتياطية لبياناتك ولا تستبدلها.');
  for(const method of ['newMaterial','newStyle','receive','setBom','newOrder','advance','quality']){
    if(typeof ops?.[method]!=='function')throw Error('وظائف الإنتاج المطلوبة للعرض غير متاحة');
  }
  const {newMaterial,newStyle,receive,setBom,newOrder,advance,quality}=ops;
  const material=(code,name,unit,category)=>{
    newMaterial(db,form({code,name,unit,category}));
    return db.materials.find(m=>m.code===code);
  };
  const style=(code,name,category,sizes,colors,price)=>{
    newStyle(db,form({code,name,category,sizes,colors,price,season:'مجموعة تجريبية'}));
    return db.styles.find(s=>s.code===code);
  };
  const vId=(s,size,color)=>{
    const variant=s.variants.find(v=>v.size===size&&v.color===color);
    if(!variant)throw Error('مقاس العرض غير موجود: '+size+'/'+color);
    return variant.id;
  };
  const materialByCode=code=>db.materials.find(m=>m.code===code);
  const bom=(s,lines)=>{
    const amounts=Object.fromEntries(lines.map(([code,qty])=>['bom_'+materialByCode(code).id,qty]));
    setBom(db,s.id,form(amounts));
  };
  // Three complete product families and a low-stock accessory for dashboard alerts.
  const cotton=material('FAB-COT-01','قماش قطن بوبلين','متر','أقمشة');
  const jersey=material('FAB-JER-02','قماش جيرسي','متر','أقمشة');
  const lining=material('FAB-LIN-03','قماش بطانة','متر','أقمشة');
  const buttons=material('BTN-001','أزرار قميص','قطعة','إكسسوارات');
  const zippers=material('ZIP-001','سوستة جاكيت','قطعة','إكسسوارات');
  const thread=material('THR-001','خيط حياكة','رول','مستلزمات');
  const labels=material('LBL-001','بطاقة ماركة','قطعة','تغليف');
  const packages=material('PKG-001','كيس تغليف','قطعة','تغليف');
  const small=material('TRIM-LOW','شريط زخرفة خاص','قطعة','مستلزمات');
  for(const [m,code,qty,unitCost,shade,width] of [
    [cotton,'COT-R001',200,75,'أبيض',150],
    [cotton,'COT-R002',110,80,'أسود',150],
    [jersey,'JER-R001',240,56,'كحلي',180],
    [lining,'LIN-R001',140,35,'رمادي',155],
  ]){
    receiveFabricRoll(db,form({materialId:m.id,rollNo:code,quantity:qty,unitCost,shade,width}));
  }
  for(const [m,quantity,unitCost] of [
    [buttons,1600,1.4],[zippers,120,14],[thread,230,9],
    [labels,1700,0.7],[packages,900,2],[small,12,11],
  ]){
    receive(db,form({materialId:m.id,quantity,unitCost,reference:'INV-DEMO-'+m.code}));
  }
  const shirt=style('SH-DEMO-100','قميص رجالي رسمي','قمصان','S,M,L,XL','أبيض,أسود',345);
  const tshirt=style('TS-DEMO-210','تيشيرت قطن','تيشيرت','M,L,XL','كحلي,رمادي',195);
  const jacket=style('JK-DEMO-305','جاكيت خفيف','جاكيت','M,L','أسود,بني',680);
  bom(shirt,[['FAB-COT-01',1.7],['BTN-001',8],['THR-001',0.2],['LBL-001',1],['PKG-001',1]]);
  bom(tshirt,[['FAB-JER-02',1.35],['THR-001',0.15],['LBL-001',1],['PKG-001',1]]);
  bom(jacket,[['FAB-COT-01',1.1],['FAB-LIN-03',0.8],['ZIP-001',1],
    ['THR-001',0.5],['LBL-001',1],['PKG-001',1]]);
  for(const [code,name,role,rate] of [
    ['W-CUT-01','عامل قص تجريبي ١','قص',3],
    ['W-SEW-01','عامل خياطة تجريبي ٢','خياطة',6],
    ['W-FIN-01','عامل تشطيب تجريبي ٣','تشطيب',2],
    ['W-CUT-02','عامل قص تجريبي ٤','قص',3.5],
    ['W-QA-01','مسؤول جودة تجريبي ٥','جودة',0],
  ])addWorker(db,form({code,name,role,rate}));
  const worker=code=>db.workers.find(w=>w.code===code);
  const work=(order,qty,role)=>{
    const workers={cutting:worker('W-CUT-01'),sewing:worker('W-SEW-01'),finishing:worker('W-FIN-01')};
    registerStageWork(db,form({orderId:order.id,workerId:workers[role].id,quantity:qty,batchRef:'DEMO-'+order.ref+'-'+role}));
  };
  const next=(order,qtyFull=true)=>{
    if(['cutting','sewing','finishing'].includes(order.status)&&qtyFull){
      work(order,order.qty,order.status);
    }
    advance(db,order.id);
  };
  const advanceUntil=(order,target)=>{
    if(!stages.includes(target))throw Error('مرحلة عرض غير معروفة');
    while(order.status!==target){
      if(order.status==='quality')quality(db,order.id,form({good:order.qty,reject:0,labor:2,overhead:0}));
      next(order);
    }
  };
  const complete=(order,good,rejected)=>{
    advanceUntil(order,'quality');
    quality(db,order.id,form({good,reject:rejected,labor:order.qty*2,overhead:50}));
    advanceUntil(order,'completed'); // stock posts ONLY after packing
  };
  const lotFields={
    styleId:shirt.id,customer:'متجر الأفق — بيانات افتراضية',due:dueIn(28),
    ['matrix_'+vId(shirt,'S','أبيض')]:24,
    ['matrix_'+vId(shirt,'M','أبيض')]:36,
    ['matrix_'+vId(shirt,'L','أسود')]:28,
    ['matrix_'+vId(shirt,'XL','أسود')]:12
  };
  const lot=createProductionMatrix(db,form(lotFields));
  const groupOrder=(size,color)=>lot.orders.find(o=>o.variantId===vId(shirt,size,color));
  const shirtSmall=groupOrder('S','أبيض');
  const shirtMedium=groupOrder('M','أبيض');
  const shirtLarge=groupOrder('L','أسود');
  const shirtXL=groupOrder('XL','أسود');
  addCuttingBundle(db,form({orderId:shirtMedium.id,bundleNo:'DEMO-SH-M-01',quantity:18,notes:'رصّة القماش الأولى'}));
  addCuttingBundle(db,form({orderId:shirtMedium.id,bundleNo:'DEMO-SH-M-02',quantity:18,notes:'رصّة القماش الثانية'}));
  complete(shirtSmall,23,1);
  complete(shirtMedium,34,2);
  next(shirtLarge); // cutting with partial work record
  work(shirtLarge,8,'cutting');
  advanceUntil(shirtXL,'sewing');
  work(shirtXL,5,'sewing');
  const individual=(s,size,color,qty,customer)=>{
    newOrder(db,form({styleId:s.id,variantId:vId(s,size,color),quantity:qty,customer,due:dueIn(25)}));
    return db.orders[0];
  };
  const teeComplete=individual(tshirt,'M','كحلي',30,'متجر السوق — تجريبي');
  complete(teeComplete,28,2);
  const teeQC=individual(tshirt,'L','رمادي',20,'عميل قيد الفحص — تجريبي');
  advanceUntil(teeQC,'quality'); // awaiting QC
  const jacketFinish=individual(jacket,'M','أسود',16,'تاجر الأناقة — تجريبي');
  advanceUntil(jacketFinish,'finishing');
  work(jacketFinish,6,'finishing'); // in progress
  individual(jacket,'L','بني',12,'عميل جديد — تجريبي'); // planned
  // Every additional White tex operation appears in the opt-in demonstration.
  for(const phase of ['initial_sorting','production_line','printing','ironing','presentation_quality','packing']){
    const sample=individual(tshirt,'XL','رمادي',2,'مرحلة '+phase+' — عرض تجريبي');
    advanceUntil(sample,phase);
  }
  const sale=(s,customer,entries)=>{
    const fields={styleId:s.id,customer,due:dueIn(30)};
    for(const [size,color,qty] of entries)fields['sell_'+vId(s,size,color)]=qty;
    return createWholesaleOrder(db,form(fields));
  };
  const delivery=(order,ref,entries)=>{
    const fields={orderId:order.id,reference:ref};
    const s=db.styles.find(s=>s.id===order.styleId);
    for(const [size,color,qty] of entries)fields['ship_'+vId(s,size,color)]=qty;
    return dispatchWholesaleOrder(db,form(fields));
  };
  const retail=sale(shirt,'معرض النخبة — عميل افتراضي',[
    ['S','أبيض',18],['M','أبيض',25],['L','أسود',10]]);
  delivery(retail,'DEMO-DO-001',[['S','أبيض',10],['M','أبيض',14]]);
  const sport=sale(tshirt,'متجر الرياضة — عميل افتراضي',[['M','كحلي',22]]);
  delivery(sport,'DEMO-DO-002',[['M','كحلي',22]]);
  sale(jacket,'بوتيك المدينة — عميل افتراضي',[['M','أسود',10]]);
  db.demoMode=true;
  db.demoInfo={name:'معاينة شاملة — بيانات افتراضية غير حقيقية',createdAt:new Date().toISOString(),version:1};
  validateWholesaleLedger(db);
  const coverage=demoCoverage(db);
  if(!(coverage.styles>=3&&coverage.materials>=9&&coverage.rolls>=4&&coverage.workers>=5
       &&coverage.finished>=3&&coverage.sales>=3&&coverage.dispatches>=2
       &&coverage.bundles>=2&&coverage.lots>=1&&coverage.audit>=20
       &&stages.every(s=>coverage.statuses[s]>0))){
    throw Error('تعذر تجهيز بيانات عرض مكتملة لجميع الشاشات');
  }
  return coverage;
}
