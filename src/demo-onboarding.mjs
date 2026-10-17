/* White tex public temporary showcase policy.
 * Demo data is the default until the product owner chooses to turn off this flag.
 * The decision to start using real data is saved per browser.
 * Never uploads fictional records or overwrites an existing saved dataset.
 */
export const DEFAULT_DEMO_ENABLED=true; // Temporary public preview: switch to false when requested.
export const DEMO_OPT_OUT_KEY='white-tex-real-mode-v1';
export function optedOutOfDemo(storage){
  try{return storage?.getItem(DEMO_OPT_OUT_KEY)==='1';}
  catch{return false;}
}
export function preferRealData(storage){
  if(!storage||typeof storage.setItem!=='function')throw Error('تعذر حفظ اختيار بيانات العمل');
  storage.setItem(DEMO_OPT_OUT_KEY,'1');
  return true;
}
export function initializeFirstVisitDemo({storage,key,createFresh,populate,enabled=DEFAULT_DEMO_ENABLED}){
  if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'
    ||typeof key!=='string'||!key||typeof createFresh!=='function'||typeof populate!=='function')
    throw Error('إعداد بيانات العرض غير صحيح');
  if(!enabled||optedOutOfDemo(storage))return null;
  // An existing JSON snapshot (including an intentionally blank or malformed one)
  // belongs to that visitor and must never be replaced automatically.
  if(storage.getItem(key)!==null)return null;
  const preview=createFresh();
  populate(preview);
  if(preview?.demoMode!==true)throw Error('تعذر تجهيز نسخة العرض التجريبية');
  // Commit only after ALL demo operations succeed; no half-created samples.
  storage.setItem(key,JSON.stringify(preview));
  return preview;
}
