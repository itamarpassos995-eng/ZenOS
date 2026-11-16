// ZenOS Web: build detection and safe recovery. No Firebase calls.
// NEVER delete Firestore IndexedDB, user/session storage, PDV drafts or
// operational receipts automatically. Those can contain pending actions.
export const CLIENT_BUILD_KEY = 'zenos_client_app_version';
export const CLIENT_BUILD_RELOAD_KEY = 'zenos_client_reload_attempt';
export const CLIENT_RECOVERY_EVENT = 'zenos:client-recovery-required';
export const CLIENT_BUILD_ID = typeof __ZENOS_BUILD_ID__ !== 'undefined'
  ? String(__ZENOS_BUILD_ID__) : 'development';

function read(storage, key) {
  try { return storage?.getItem(key) || null; } catch { return null; }
}
function write(storage, key, value) {
  try { storage?.setItem(key,value); return true; } catch { return false; }
}

// Delete ONLY named disposable cache buckets owned by this application.
// The Firestore persistence database and "zenos-pdv-protecao" are NEVER touched.
export async function clearDisposableWebCaches() {
  if (typeof window === 'undefined' || !window.caches) return {removed:0};
  const names = await window.caches.keys();
  const disposable = names.filter(name => /^(zenos-(?:static|assets|app-shell|precache)|workbox-precache-)/i.test(name));
  const results = await Promise.allSettled(disposable.map(name => window.caches.delete(name)));
  return {removed:results.filter(result=>result.status==='fulfilled'&&result.value).length};
}

export async function checkBuildAtBootstrap() {
  if (typeof window === 'undefined') return false;
  const current = CLIENT_BUILD_ID;
  const previous = read(window.localStorage,CLIENT_BUILD_KEY);
  if (previous === current) return false;
  if (previous === null) {
    // First install or recovered browser; never treat missing version as
    // permission to destroy data. Mark build and proceed normally.
    write(window.localStorage,CLIENT_BUILD_KEY,current);
    return false;
  }
  const attempt = previous + '>' + current;
  if (read(window.sessionStorage,CLIENT_BUILD_RELOAD_KEY) === attempt) return false;
  write(window.sessionStorage,CLIENT_BUILD_RELOAD_KEY,attempt);
  try { await clearDisposableWebCaches(); }
  catch(error) { console.warn('[ZenOS Build] Cache cleanup failed safely',error); }
  if (!write(window.localStorage,CLIENT_BUILD_KEY,current)) return false;
  window.location.reload();
  return true;
}

// One recovery prompt per failing page, never an automatic sale retry.
// A route mismatch may be a REAL server inconsistency; clearing caches
// cannot certify a transaction or make a rejected financial write succeed.
export function dispatchRouteRecovery(error) {
  if (typeof window === 'undefined') return false;
  const code=String(error?.code || '');
  if (!['ZENOS_STORAGE_ROUTE_MISMATCH','ZENOS_STORAGE_ROUTE_CHANGED','V2_ROUTE_CHANGED','ZENOS_V2_ROUTE_NOT_READY'].includes(code)) return false;
  window.dispatchEvent(new CustomEvent(CLIENT_RECOVERY_EVENT,{detail:{code}}));
  return true;
}

export function installRecoveryPrompt() {
  if (typeof window === 'undefined' || window.__zenosBuildRecoveryInstalled) return;
  window.__zenosBuildRecoveryInstalled=true;
  window.addEventListener(CLIENT_RECOVERY_EVENT, event => {
    if(document.getElementById('zenos-recovery-prompt'))return;
    const overlay=document.createElement('div');
    overlay.id='zenos-recovery-prompt';
    overlay.setAttribute('role','alertdialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Recuperação do ZenOS');
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(2,6,23,.94);display:grid;place-items:center;padding:20px;color:#f8fafc;font:16px system-ui,sans-serif';
    const panel=document.createElement('div');
    panel.style.cssText='max-width:460px;background:#111827;border:1px solid #475569;padding:24px;border-radius:16px';
    const title=document.createElement('h2');
    title.textContent='Atualização do ZenOS necessária';
    title.style.cssText='font-size:21px;font-weight:700;margin:0 0 12px';
    const message=document.createElement('p');
    message.textContent='A sessão precisa ser atualizada. O carrinho e os dados locais protegidos serão preservados. Antes de repetir uma venda ou fechamento, confira o histórico e os pagamentos confirmados.';
    message.style.cssText='line-height:1.5;color:#cbd5e1';
    const btn=document.createElement('button');
    btn.type='button';btn.textContent='Recarregar ZenOS';
    btn.style.cssText='width:100%;padding:14px;border:0;border-radius:10px;background:#e11d48;color:#fff;font-weight:700;cursor:pointer';
    btn.onclick=async()=>{
      btn.disabled=true;btn.textContent='Preparando atualização…';
      try { await clearDisposableWebCaches(); }
      catch(error) { console.warn('[ZenOS Build] Cache cleanup failed safely',error); }
      window.location.reload();
    };
    const info=document.createElement('p');
    info.style.cssText='font-size:12px;color:#94a3b8;margin-top:12px';
    info.textContent='Diagnóstico: '+String(event.detail?.code||'unknown');
    panel.append(title,message,btn,info);overlay.append(panel);document.body.append(overlay);btn.focus();
  });
}
