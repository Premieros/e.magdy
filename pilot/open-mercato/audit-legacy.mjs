/* Read-only legacy Garments JSON preflight. NEVER imports into a live database.
 * Output contains aggregate counts / risk codes only, not customer or worker PII.
 */
import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ARRAYS=['styles','materials','orders','ledger','finished','workers','workLogs',
  'fabricRolls','cuttingBundles','wholesaleOrders','finishedDispatches'];
const required=['styles','materials','orders','ledger','finished'];
const saneNumber=x=>typeof x==='number'&&Number.isFinite(x);
const diff=(a,b)=>Math.abs(a-b);
const sum=(arr,fn)=>arr.reduce((s,x)=>s+fn(x),0);

export function auditLegacySnapshot(raw){
  if(!raw||Array.isArray(raw)||raw.version!==1)throw Error('Invalid Garments export version (expected 1)');
  for(const k of required)if(!Array.isArray(raw[k]))throw Error('Missing required array: '+k);
  const db=structuredClone(raw);
  for(const k of ARRAYS)if(!Array.isArray(db[k]))db[k]=[];
  const blockers=[],warnings=[];
  const issue=(code)=>{if(!blockers.includes(code))blockers.push(code)};
  const warn=(code)=>{if(!warnings.includes(code))warnings.push(code)};
  if(db.demoMode)issue('DEMO_DATA_MUST_NOT_MIGRATE');
  const sku=new Set(),styles=new Set(),variantIds=new Set(),materials=new Set();
  for(const s of db.styles){
    if(!s||!s.id||!s.code||!Array.isArray(s.variants)){issue('BAD_STYLE');continue;}
    if(styles.has(s.id))issue('DUPLICATE_STYLE_ID');
    styles.add(s.id);
    for(const v of s.variants){
      if(!v||!v.id||!v.sku||sku.has(v.sku)||variantIds.has(v.id))issue('DUPLICATE_OR_MISSING_SKU');
      if(v?.sku)sku.add(v.sku);
      if(v?.id)variantIds.add(v.id);
    }
    for(const b of s.bom||[]){
      if(!saneNumber(b.qty)||b.qty<=0)issue('INVALID_BOM_QUANTITY');
    }
  }
  for(const m of db.materials){
    if(!m?.id||materials.has(m.id)||!saneNumber(m.stock)||m.stock<0){issue('BAD_MATERIAL');continue;}
    materials.add(m.id);
    const balance=sum(db.ledger.filter(l=>l?.materialId===m.id),l=>saneNumber(l.qty)?l.qty:0);
    if(diff(m.stock,balance)>0.001)issue('RAW_LEDGER_BALANCE_MISMATCH');
  }
  for(const s of db.styles)for(const b of s?.bom||[]){
    if(!materials.has(b.materialId))issue('BOM_MISSING_MATERIAL');
  }
  const orderIds=new Set();
  for(const o of db.orders){
    if(!o?.id||orderIds.has(o.id)||!styles.has(o.styleId)||!variantIds.has(o.variantId))
      issue('ORDER_BROKEN_REFERENCE');
    if(!Number.isSafeInteger(o?.qty)||o.qty<=0)issue('INVALID_ORDER_QTY');
    if(o?.id)orderIds.add(o.id);
  }
  for(const f of db.finished){
    if(!orderIds.has(f?.orderId)||!variantIds.has(f?.variantId)||!Number.isSafeInteger(f.qty)||f.qty<0)
      issue('INVALID_FINISHED_RECEIPT');
  }
  for(const r of db.fabricRolls){
    if(!materials.has(r?.materialId)||!saneNumber(r?.remaining)||r.remaining<0
      ||!saneNumber(r.received)||r.remaining>r.received)issue('INVALID_FABRIC_ROLL');
  }
  const finishedBalance=new Map();
  for(const f of db.finished)finishedBalance.set(f.variantId,(finishedBalance.get(f.variantId)||0)+f.qty);
  const refs=new Set();
  const soldByOrder=new Map();
  const salesIds=new Set(db.wholesaleOrders.map(o=>o.id));
  for(const d of db.finishedDispatches){
    if(!d?.reference||refs.has(d.reference)||!salesIds.has(d.orderId))issue('INVALID_DISPATCH_REFERENCE');
    if(d?.reference)refs.add(d.reference);
    for(const line of d?.lines||[]){
      if(!Number.isSafeInteger(line.qty)||line.qty<=0)issue('INVALID_DISPATCH_QTY');
      finishedBalance.set(line.variantId,(finishedBalance.get(line.variantId)||0)-line.qty);
      const key=d.orderId+'|'+line.variantId;
      soldByOrder.set(key,(soldByOrder.get(key)||0)+line.qty);
    }
  }
  for(const o of db.wholesaleOrders){
    for(const line of o?.lines||[]){
      if(!variantIds.has(line.variantId)||!Number.isSafeInteger(line.qty)||line.qty<=0)issue('INVALID_SALES_LINE');
      if((soldByOrder.get(o.id+'|'+line.variantId)||0)>line.qty)issue('SHIPMENT_EXCEEDS_ORDER');
    }
  }
  if([...finishedBalance.values()].some(v=>v<0))issue('NEGATIVE_FINISHED_STOCK');
  if(db.orders.some(o=>o.status!=='completed'))warn('OPEN_WORK_ORDERS_REQUIRE_STATUS_MAPPING');
  if(db.finishedDispatches.length)warn('FULFILLMENT_HISTORY_REQUIRES_IDEMPOTENT_IMPORT');
  if(db.workLogs.length)warn('PIECEWORK_RATES_REQUIRE_FINANCIAL_RECONCILIATION');
  warn('OPEN_MERCATO_ENTITY_MAPPING_NOT_YET_APPLIED');
  warn('CENTRAL_INTAKE_ORDERS_NOT_INCLUDED_IN_BROWSER_EXPORT');
  const counts=Object.fromEntries(ARRAYS.map(k=>[k,db[k].length]));
  counts.sku=sku.size;
  return {source:'PremierOS Garments local export v1',counts,blockers,warnings,
    readyForAutomaticImport:false};
}
function main(){
  const file=process.argv[2];
  if(!file)throw Error('Usage: node pilot/open-mercato/audit-legacy.mjs /path/to/export.json');
  if(statSync(file).size>10*1024*1024)throw Error('File too large for pilot audit');
  const report=auditLegacySnapshot(JSON.parse(readFileSync(file,'utf8')));
  console.log(JSON.stringify(report,null,2));
  if(report.blockers.length)process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{main();}catch(err){console.error('Legacy audit failed: '+err.message);process.exitCode=1;}
}
