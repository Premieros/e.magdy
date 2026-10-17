/* White tex public showcase onboarding.
 * First-time visitors receive a LOCAL copy of the same fictional demonstration fixture.
 * Never reads, replaces or uploads any existing browser record.
 */
export function initializeFirstVisitDemo({storage,key,createFresh,populate}){
  if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'
    ||typeof key!=='string'||!key||typeof createFresh!=='function'||typeof populate!=='function')
    throw Error('إعداد بيانات العرض غير صحيح');
  // A saved JSON snapshot (even a deliberately empty one) belongs to its visitor.
  if(storage.getItem(key)!==null)return null;
  const preview=createFresh();
  populate(preview);
  if(preview?.demoMode!==true)throw Error('تعذر تجهيز نسخة العرض التجريبية');
  // Commit only after ALL demo operations succeeded; no half-created samples.
  storage.setItem(key,JSON.stringify(preview));
  return preview;
}
