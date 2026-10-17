/* White tex opt-in cross-device synchronization.
 * A single authenticated snapshot owner is the scope. No public/anonymous data API.
 * Does not merge simultaneous inventory changes: it halts and asks which copy to use.
 */
export const SYNC_INTERVAL_MS=20000;
export const SYNC_MODES=Object.freeze({
  off:'off',checking:'checking',choose:'choose',active:'active',busy:'busy',
  conflict:'conflict',offline:'offline'
});
export const serializeSnapshot=db=>JSON.stringify(db);
export const hasBusinessData=db=>([
  'styles','materials','orders','ledger','finished','audit',
  'workers','workLogs','fabricRolls','cuttingBundles','wholesaleOrders',
  'finishedDispatches','financeEntries','appUsers'
]).some(key=>Array.isArray(db?.[key])&&db[key].length>0);
export function createCloudSync({getLocal,applyRemote,load,save,onState=()=>{}}){
  let mode='off',revision=null,baseline=null,pending=null,inFlight=false,error='',lastSynced='';
  const state=()=>({mode,revision,lastSynced,error,hasRemote:!!pending,
    remoteUpdatedAt:pending?.updatedAt||null,hasLocalData:hasBusinessData(getLocal())});
  const notify=()=>{onState(state());return state();};
  const update=(next,reason='')=>{mode=next;error=reason;return notify();};
  const current=()=>serializeSnapshot(getLocal());
  const activate=(rev,data)=>{
    revision=rev;baseline=serializeSnapshot(data);
    pending=null;lastSynced=new Date().toISOString();
    return update('active');
  };
  const stop=()=>{mode='off';revision=null;baseline=null;pending=null;lastSynced='';error='';return notify();};
  async function begin(){
    if(inFlight)return state();
    inFlight=true;update('checking');
    try{
      const initial=current(),remote=await load();
      if(remote&&(typeof remote.updatedAt!=='string'||!remote.updatedAt))throw Error('النسخة السحابية لا تحتوي على تاريخ تحديث صالح');
      if(current()!==initial){pending=remote;return update('conflict','تغيرت بيانات الجهاز أثناء التحقق؛ أعد المحاولة');}
      if(remote&&serializeSnapshot(remote.data)===initial){
        return activate(remote.updatedAt,remote.data);
      }
      pending=remote;
      return update('choose');
    }catch(err){return update('offline',err?.message||'تعذر الاتصال بقاعدة البيانات');}
    finally{inFlight=false;}
  }
  async function useCloud(){
    if(mode!=='choose'&&mode!=='conflict')throw Error('ابدأ التحقق من النسخة السحابية أولًا');
    if(inFlight)return state();
    inFlight=true;update('checking');
    try{
      const before=current(),remote=await load();
      if(!remote){pending=null;return update('choose','لا توجد نسخة سحابية للاستخدام');}
      if(current()!==before){pending=remote;return update('conflict','تغيرت بيانات الجهاز أثناء التحميل');}
      // If the remote copy changes while choosing, the latest copy takes precedence.
      applyRemote(remote.data);
      return activate(remote.updatedAt,remote.data);
    }catch(err){return update('offline',err?.message||'تعذر استلام بيانات السحابة');}
    finally{inFlight=false;}
  }
  async function useLocal(){
    if(mode!=='choose'&&mode!=='conflict')throw Error('ابدأ التحقق من النسخة السحابية أولًا');
    if(inFlight)return state();
    inFlight=true;update('checking');
    try{
      const before=current(),latest=await load();
      if(latest?.updatedAt!==pending?.updatedAt){
        pending=latest;return update('conflict','وصل تحديث جديد من جهاز آخر. راجع النسختين قبل المتابعة');
      }
      if(current()!==before)return update('conflict','تغيرت بيانات هذا الجهاز أثناء المراجعة');
      const rev=await save(getLocal(),latest?.updatedAt??null);
      // Any edits made during the async write remain dirty, never lost.
      revision=rev;baseline=before;pending=null;lastSynced=new Date().toISOString();
      return update('active');
    }catch(err){
      if(err?.name==='CloudConflictError')return update('conflict',err.message);
      return update('offline',err?.message||'تعذر رفع بيانات الجهاز');
    }finally{inFlight=false;}
  }
  async function tick(){
    if(!['active','offline'].includes(mode)||inFlight||revision===null)return state();
    inFlight=true;
    try{
      const before=current();
      if(before!==baseline){
        if(getLocal()?.demoMode)return update('conflict','لا يمكن إرسال بيانات العرض التجريبية');
        const rev=await save(getLocal(),revision);
        revision=rev;baseline=before;lastSynced=new Date().toISOString();
        return update('active');
      }
      const remote=await load();
      if(!remote)return update('conflict','النسخة السحابية غير موجودة');
      if(remote.updatedAt!==revision){
        if(current()!==baseline){pending=remote;return update('conflict','هناك بيانات جديدة على جهازين؛ اختر نسخة واحدة');}
        applyRemote(remote.data);
        return activate(remote.updatedAt,remote.data);
      }
      lastSynced=new Date().toISOString();
      return update('active');
    }catch(err){
      if(err?.name==='CloudConflictError'){
        pending=null;return update('conflict',err.message);
      }
      return update('offline',err?.message||'انقطع الاتصال؛ ستظل بيانات الجهاز محفوظة');
    }finally{inFlight=false;}
  }
  return {state,stop,begin,useCloud,useLocal,tick};
}
