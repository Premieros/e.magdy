/* White tex operational analytics: plain-language facts derived only from local factory records.
 * No external analytics endpoint, fake numbers, guessed costs or cross-unit stock totals.
 */
const entries=(db,key)=>Array.isArray(db?.[key])?db[key]:[];
const finite=value=>Number.isFinite(Number(value))?Number(value):0;
const rounded=value=>Math.round(value*100)/100;
const localKey=value=>{
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return null;
  const pad=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
};
export const ANALYTICS_STAGES=Object.freeze([
  {label:'لم يبدأ',keys:['planned']},
  {label:'القص والفرز',keys:['cutting','initial_sorting']},
  {label:'خط الإنتاج والخياطة',keys:['production_line','sewing','finishing']},
  {label:'مراحل الجودة',keys:['quality','presentation_quality']},
  {label:'الطباعة والتجهيز',keys:['printing','ironing','packing']},
  {label:'اكتمل الإنتاج',keys:['completed']}
]);
export function dashboardAnalytics(db,today=new Date()){
  const orders=entries(db,'orders');
  const active=orders.filter(o=>!['completed','cancelled'].includes(o.status));
  const validOrders=orders.filter(o=>o.status!=='cancelled');
  const complete=validOrders.filter(o=>o.status==='completed');
  const examined=validOrders.filter(o=>finite(o.qty)>0 && finite(o.good)>0 &&
    finite(o.good)+finite(o.reject)===finite(o.qty));
  const good=examined.reduce((sum,o)=>sum+finite(o.good),0);
  const rejected=examined.reduce((sum,o)=>sum+finite(o.reject),0);
  const total=good+rejected;
  const shipped=entries(db,'finishedDispatches').reduce((sum,row)=>
    sum+entries(row,'lines').reduce((n,line)=>n+finite(line.qty),0),0);
  const onHand=entries(db,'finished').reduce((sum,row)=>sum+finite(row.qty),0)-shipped;
  const days=Array.from({length:7},(_,i)=>{
    const d=new Date(today.getFullYear(),today.getMonth(),today.getDate()-(6-i));
    return {date:localKey(d),label:new Intl.DateTimeFormat('ar-EG',{weekday:'short'}).format(d),
      completed:0,orders:0};
  });
  const byDate=new Map(days.map(day=>[day.date,day]));
  for(const order of orders){
    for(const h of Array.isArray(order.history)?order.history:[]){
      if(h.stage!=='completed')continue;
      const row=byDate.get(localKey(h.at));
      if(row){row.completed+=finite(order.good);row.orders++;}
      break;
    }
  }
  const stages=ANALYTICS_STAGES.map(group=>({
    label:group.label,
    value:orders.filter(o=>group.keys.includes(o.status)).length
  }));
  const styleNames=new Map(entries(db,'styles').map(s=>[s.id,s.name]));
  const models=new Map();
  for(const o of orders){
    if(o.status==='cancelled')continue;
    const name=styleNames.get(o.styleId)||'موديل غير معروف';
    const row=models.get(name)||{name,qty:0,orders:0};
    row.qty+=finite(o.qty);row.orders++;
    models.set(name,row);
  }
  const topModels=[...models.values()].sort((a,b)=>b.qty-a.qty||a.name.localeCompare(b.name)).slice(0,5);
  const materials=entries(db,'materials');
  const low=materials.filter(m=>finite(m.stock)<25);
  const noStock=materials.filter(m=>finite(m.stock)<=0);
  const burden=stages.filter(s=>!['لم يبدأ','اكتمل الإنتاج'].includes(s.label))
    .sort((a,b)=>b.value-a.value)[0];
  const dailyTotal=days.reduce((sum,day)=>sum+day.completed,0);
  const insights=[];
  if(validOrders.length){
    if(active.length&&burden?.value>0)insights.push('أكثر المراحل انشغالًا: '+burden.label+' ('+burden.value+' أوامر).');
    insights.push('اكتمل '+complete.length+' من أصل '+validOrders.length+' أوامر تصنيع.');
  }
  if(total>0)insights.push('اجتازت '+good+' قطعة فحص الجودة من أصل '+total+' قطعة مفحوصة.');
  if(noStock.length)insights.push('هناك '+noStock.length+' خامات نفد رصيدها وتحتاج متابعة.');
  else if(low.length)insights.push('هناك '+low.length+' خامات رصيدها أقل من 25 وحدة.');
  if(dailyTotal>0)insights.push('أُكمل تصنيع '+dailyTotal+' قطعة خلال الأيام السبعة الماضية.');
  if(!insights.length)insights.push('عندما تُسجَّل أوامر الإنتاج وحركات المخزون، ستظهر نتائج التحليل هنا.');
  return {
    totalOrders:validOrders.length,activeOrders:active.length,completedOrders:complete.length,
    completionRate:validOrders.length?rounded(100*complete.length/validOrders.length):null,
    inspected:total,good,rejected,qualityRate:total?rounded(100*good/total):null,
    shipped,onHand,lowCount:low.length,outOfStock:noStock.length,
    daily:days,dailyTotal,stages,topModels,insights:insights.slice(0,4)
  };
}
