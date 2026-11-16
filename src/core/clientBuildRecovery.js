// ZenOS Web AutoRecovery — never deletes local business data.
// Firestore persistence, operational receipts, authentication and protected PDV
// drafts are NOT cache. A pending Firestore write is not a saved PDV draft.
export const CLIENT_BUILD_KEY = 'zenos_client_app_version';
export const CLIENT_BUILD_RELOAD_KEY = 'zenos_client_reload_attempt';
export const CLIENT_RECOVERY_EVENT = 'zenos:client-recovery-required';
export const CLIENT_BUILD_ID = typeof __ZENOS_BUILD_ID__ !== 'undefined'
  ? String(__ZENOS_BUILD_ID__) : 'development';

const SYNC_TIMEOUT_MS = 15000;
const RECOVERABLE_CODES = new Set([
  'ZENOS_STORAGE_ROUTE_MISMATCH',
  'ZENOS_STORAGE_ROUTE_CHANGED',
  'V2_ROUTE_CHANGED',
  'ZENOS_V2_ROUTE_NOT_READY',
]);

const read = (storage,key) => {
  try { return storage.getItem(key); } catch { return null; }
};
const write = (storage,key,value) => {
  try { storage.setItem(key,value); return true; } catch { return false; }
};
const withTimeout = (promise,ms=SYNC_TIMEOUT_MS) => {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('ZENOS_SYNC_TIMEOUT')),ms);}),
  ]).finally(()=>clearTimeout(timer));
};

function pendingLocalDrafts() {
  try {
    for(let index=0;index<window.localStorage.length;index++){
      const key=window.localStorage.key(index);
      if(!key || !/_pdv_rascunho_/i.test(key))continue;
      const raw=window.localStorage.getItem(key);
      if(!raw)continue;
      // An unreadable draft must NEVER be assumed to be disposable.
      let parsed;
      try { parsed=JSON.parse(raw); } catch { return true; }
      if(parsed?.itensVenda?.length || parsed?.prePedidoEmAbertoId) return true;
      if(!parsed || !Array.isArray(parsed.itensVenda))return true;
    }
    return false;
  }catch{return true;}
}

// Check the fallback IDB without creating a new database or deleting anything.
// Unknown/busy/unsupported IndexedDB => fail closed, protect the operator.
async function pendingProtectedDrafts() {
  if(typeof indexedDB==='undefined' || typeof indexedDB.databases!=='function')
    return {known:false,pending:true};
  const known=await indexedDB.databases();
  if(!known.some(item=>item.name==='zenos-pdv-protecao'))
    return {known:true,pending:false};
  return withTimeout(new Promise((resolve,reject)=>{
    let database;
    const request=indexedDB.open('zenos-pdv-protecao');
    request.onupgradeneeded=()=>{request.transaction?.abort();};
    request.onerror=()=>reject(request.error||Error('PDV_IDB_UNAVAILABLE'));
    request.onblocked=()=>reject(Error('PDV_IDB_BLOCKED'));
    request.onsuccess=()=>{
      database=request.result;
      if(!database.objectStoreNames.contains('rascunhos')){
        database.close();reject(Error('PDV_IDB_MISSING_STORE'));return;
      }
      const tx=database.transaction('rascunhos','readonly');
      const cursor=tx.objectStore('rascunhos').openCursor();
      let pending=false;
      cursor.onsuccess=()=>{
        if(!cursor.result)return;
        // Any durable backup is protected: may represent a payment awaiting
        // reconciliation even if its cart is empty or unreadable.
        pending=true;
        cursor.result.continue();
      };
      cursor.onerror=()=>reject(cursor.error||Error('PDV_IDB_READ_FAILED'));
      tx.oncomplete=()=>{database.close();resolve({known:true,pending});};
      tx.onabort=()=>{database.close();reject(tx.error||Error('PDV_IDB_ABORTED'));};
      tx.onerror=()=>{database.close();reject(tx.error||Error('PDV_IDB_TX_ERROR'));};
    };
  }));
}

// This checks the current tab's existing Firestore writes. It cannot
// commit an unsubmitted cart, nor prove there are no writes in other tabs.
// No Firestore document reads are performed here.
export async function inspectPendingOperations({sync=true}={}){
  if(typeof window==='undefined')return {safe:false,reason:'no-window'};
  if(window.navigator.onLine===false)return {safe:false,reason:'offline'};
  if(pendingLocalDrafts())return {safe:false,reason:'draft'};
  try {
    const protectedDrafts=await pendingProtectedDrafts();
    if(!protectedDrafts.known)return {safe:false,reason:'unknown-drafts'};
    if(protectedDrafts.pending)return {safe:false,reason:'draft'};
  }catch{return {safe:false,reason:'unknown-drafts'};}
  if(!sync)return {safe:false,reason:'sync-not-confirmed'};
  try {
    // Dynamic load to avoid initializing Firestore during the normal
    // no-update boot path. waitForPendingWrites adds NO document reads.
    const [{waitForPendingWrites},{auth,db}]=await Promise.all([
      import('firebase/firestore'),import('../firebase.js'),
    ]);
    if(typeof auth.authStateReady==='function')
      await withTimeout(auth.authStateReady());
    if(!auth.currentUser)return {safe:false,reason:'not-authenticated'};
    await withTimeout(waitForPendingWrites(db));
    // Detect a cart saved during the wait. Protect it rather than reload.
    if(pendingLocalDrafts())return {safe:false,reason:'draft'};
    const again=await pendingProtectedDrafts();
    if(!again.known || again.pending)
      return {safe:false,reason:'draft'};
    return {safe:true,reason:'confirmed-for-this-tab'};
  }catch{return {safe:false,reason:'sync-unconfirmed'};}
}

export async function clearDisposableWebCaches(){
  if(typeof window==='undefined' || !window.caches)return {removed:0};
  const names=await window.caches.keys();
  const disposable=names.filter(name=>
    /^(zenos-(?:static|assets|app-shell|precache)|workbox-precache-)/i.test(name)
  );
  const results=await Promise.all(disposable.map(name=>window.caches.delete(name)));
  if(results.some(value=>value===false))
    throw Error('ZENOS_CACHE_CLEANUP_INCOMPLETE');
  return {removed:results.length};
}

async function updateAndReload({oldBuild,automatic=false}={}){
  const status=await inspectPendingOperations();
  if(!status.safe)return status;
  try { await clearDisposableWebCaches(); }
  catch {return {safe:false,reason:'cache-unavailable'};}
  if(oldBuild!==undefined){
    if(!write(window.localStorage,CLIENT_BUILD_KEY,CLIENT_BUILD_ID))
      return {safe:false,reason:'storage-unavailable'};
  }
  // Only one AUTO reload for a given version transition.
  if(automatic && oldBuild!==undefined)
    write(window.sessionStorage,CLIENT_BUILD_RELOAD_KEY,oldBuild+'>'+CLIENT_BUILD_ID);
  window.location.reload();
  return {safe:true,reason:'reloading'};
}

export async function checkBuildAtBootstrap(){
  if(typeof window==='undefined')return false;
  const previous=read(window.localStorage,CLIENT_BUILD_KEY);
  if(previous===CLIENT_BUILD_ID)return false;
  if(previous===null){
    // First install/cleared storage: mark but never delete prior drafts.
    write(window.localStorage,CLIENT_BUILD_KEY,CLIENT_BUILD_ID);
    return false;
  }
  if(read(window.sessionStorage,CLIENT_BUILD_RELOAD_KEY)===previous+'>'+CLIENT_BUILD_ID)
    return false;
  window.dispatchEvent(new CustomEvent(CLIENT_RECOVERY_EVENT,{
    detail:{code:'ZENOS_BUILD_CHANGED',previousBuild:previous},
  }));
  // Rendering continues to allow accessing drafts if recovery isn't safe.
  return false;
}

export function dispatchRouteRecovery(error){
  if(typeof window==='undefined')return false;
  const code=String(error?.code||'');
  if(!RECOVERABLE_CODES.has(code))return false;
  window.dispatchEvent(new CustomEvent(CLIENT_RECOVERY_EVENT,{detail:{code}}));
  return true;
}

export function installRecoveryPrompt(){
  if(typeof window==='undefined'||window.__zenosBuildRecoveryInstalled)return;
  window.__zenosBuildRecoveryInstalled=true;
  window.addEventListener(CLIENT_RECOVERY_EVENT,event=>{
    if(document.getElementById('zenos-recovery-prompt'))return;
    const isBuild=event.detail?.code==='ZENOS_BUILD_CHANGED';
    const overlay=document.createElement('div');
    overlay.id='zenos-recovery-prompt';
    overlay.setAttribute('role','alertdialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Atualização segura do ZenOS');
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(2,6,23,.94);display:grid;place-items:center;padding:20px;color:#f8fafc;font:16px system-ui,sans-serif';
    const panel=document.createElement('div');
    panel.style.cssText='width:100%;max-width:460px;background:#111827;border:1px solid #475569;padding:24px;border-radius:16px';
    const title=document.createElement('h2');
    title.textContent='Atualização do ZenOS';
    title.style.cssText='font-size:21px;font-weight:700;margin:0 0 12px';
    const message=document.createElement('p');
    message.style.cssText='line-height:1.5;color:#cbd5e1';
    message.textContent='Verificando a sincronização antes de atualizar…';
    const button=document.createElement('button');
    button.type='button';
    button.textContent='Nova versão disponível. Sincronizar e Atualizar';
    button.style.cssText='width:100%;padding:14px;border:0;border-radius:10px;background:#e11d48;color:#fff;font-weight:700;cursor:pointer;margin-top:12px';
    const close=document.createElement('button');
    close.type='button';
    close.textContent='Voltar ao atendimento';
    close.style.cssText='width:100%;padding:12px;border:1px solid #64748b;border-radius:10px;background:transparent;color:#fff;cursor:pointer;margin-top:10px';
    const detail=document.createElement('p');
    detail.style.cssText='color:#94a3b8;font-size:12px';
    detail.textContent='Diagnóstico: '+String(event.detail?.code||'unknown');
    const dismiss=()=>overlay.remove();
    close.onclick=dismiss;
    const showBlocked=result=>{
      const drafts=['draft','unknown-drafts'].includes(result.reason);
      message.textContent=drafts
        ? 'Há um atendimento ou backup local protegido. O ZenOS não pode enviar um carrinho não confirmado automaticamente. Volte ao atendimento e confira a venda e os pagamentos antes de atualizar. Nenhum dado foi apagado.'
        : 'A sincronização não foi confirmada. Confira sua conexão e o histórico antes de repetir qualquer venda ou fechamento. Seus dados locais foram preservados.';
    };
    let working=false;
    const run=async automatic=>{
      if(working)return;
      working=true;button.disabled=true;close.disabled=true;
      button.textContent='Verificando sincronização…';
      try {
        const result=await updateAndReload({
          oldBuild:isBuild?event.detail.previousBuild:undefined,
          automatic,
        });
        if(!result.safe)showBlocked(result);
      } catch {
        showBlocked({reason:'sync-unconfirmed'});
      }finally {
        working=false;button.disabled=false;close.disabled=false;
        button.textContent='Nova versão disponível. Sincronizar e Atualizar';
      }
    };
    button.onclick=()=>{void run(false);};
    panel.append(title,message,button,close,detail);
    overlay.append(panel);document.body.append(overlay);
    // Build update: silent auto-reload only after safe confirmation.
    // Route mismatch during a sale: NEVER automatically retry/reload.
    if(isBuild)void run(true);
    else message.textContent='A sessão do ZenOS mudou. Seus dados serão preservados. Confira se a venda já consta no histórico antes de sincronizar e atualizar.';
  });
}
