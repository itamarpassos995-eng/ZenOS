import {test,expect,beforeEach,afterEach,vi} from 'vitest';
import {
  checkBuildAtBootstrap,clearDisposableWebCaches,
  dispatchRouteRecovery,installRecoveryPrompt,inspectPendingOperations,
  CLIENT_BUILD_ID,CLIENT_BUILD_KEY,
} from '../../src/core/clientBuildRecovery.js';

const mocks=vi.hoisted(()=>({
  pending:vi.fn(async()=>{}),
  auth:{currentUser:{uid:'test'},authStateReady:vi.fn(async()=>{})},
  db:{},
}));
vi.mock('firebase/firestore',async original=>({
  ...(await original()),waitForPendingWrites:mocks.pending,
}));
vi.mock('../../src/firebase.js',()=>({auth:mocks.auth,db:mocks.db}));

let originalIndexedDB,originalCaches;
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear();document.body.innerHTML='';
 delete window.__zenosBuildRecoveryInstalled;
 originalIndexedDB=globalThis.indexedDB;
 originalCaches=window.caches;
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{
   databases:async()=>[],
 }});
 mocks.pending.mockClear();
 mocks.pending.mockResolvedValue(undefined);
 mocks.auth.currentUser={uid:'test'};
 mocks.auth.authStateReady.mockResolvedValue(undefined);
});
afterEach(()=>{
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:originalIndexedDB});
 Object.defineProperty(window,'caches',{configurable:true,value:originalCaches});
});

test('first boot records version but never deletes a protected cart',async()=>{
 localStorage.setItem('zenos_vipe_pdv_rascunho_admin',JSON.stringify({itensVenda:[{id:'sku',qtd:1}]}));
 expect(await checkBuildAtBootstrap()).toBe(false);
 expect(localStorage.getItem(CLIENT_BUILD_KEY)).toBe(CLIENT_BUILD_ID);
 expect(localStorage.getItem('zenos_vipe_pdv_rascunho_admin')).toContain('sku');
 expect(mocks.pending).not.toHaveBeenCalled();
});

test('build change with protected sale backup never opens blocking modal or flushes writes',async()=>{
 installRecoveryPrompt();
 localStorage.setItem(CLIENT_BUILD_KEY,'previous-build');
 localStorage.setItem('zenos_vipe_pdv_rascunho_admin',JSON.stringify({itensVenda:[{id:'sale-123'}]}));
 expect(await checkBuildAtBootstrap()).toBe(false);
 expect(localStorage.getItem(CLIENT_BUILD_KEY)).toBe(CLIENT_BUILD_ID);
 expect(localStorage.getItem('zenos_vipe_pdv_rascunho_admin')).toContain('sale-123');
 expect(document.getElementById('zenos-recovery-prompt')).toBeNull();
 expect(mocks.pending).not.toHaveBeenCalled();
});

test('build change while signed out never blocks terminal login',async()=>{
 installRecoveryPrompt();
 mocks.auth.currentUser=null;
 localStorage.setItem(CLIENT_BUILD_KEY,'old-build');
 expect(await checkBuildAtBootstrap()).toBe(false);
 expect(document.getElementById('zenos-recovery-prompt')).toBeNull();
 expect(localStorage.getItem(CLIENT_BUILD_KEY)).toBe(CLIENT_BUILD_ID);
 expect(mocks.pending).not.toHaveBeenCalled();
});

test('a protected draft blocks any auto-sync/reload attempt',async()=>{
 localStorage.setItem('zenos_vipe_pdv_rascunho_admin',JSON.stringify({itensVenda:[{id:'P-1'}]}));
 expect(await inspectPendingOperations()).toEqual({safe:false,reason:'draft'});
 expect(mocks.pending).not.toHaveBeenCalled();
});

test('unreadable local backup fails closed without any Firebase query',async()=>{
 localStorage.setItem('zenos_vipe_pdv_rascunho_admin','{broken');
 expect(await inspectPendingOperations()).toEqual({safe:false,reason:'draft'});
 expect(mocks.pending).not.toHaveBeenCalled();
});

test('IndexedDB inspection unsupported fails closed',async()=>{
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{}});
 expect(await inspectPendingOperations()).toEqual({safe:false,reason:'unknown-drafts'});
 expect(mocks.pending).not.toHaveBeenCalled();
});

test('waitForPendingWrites ACK is required before declaring ready',async()=>{
 expect(await inspectPendingOperations()).toEqual({safe:true,reason:'confirmed-for-this-tab'});
 expect(mocks.pending).toHaveBeenCalledTimes(1);
 mocks.pending.mockRejectedValueOnce(Error('offline'));
 expect(await inspectPendingOperations()).toEqual({safe:false,reason:'sync-unconfirmed'});
});

test('without authenticated operator a sync is never presumed complete',async()=>{
 mocks.auth.currentUser=null;
 expect(await inspectPendingOperations()).toEqual({safe:false,reason:'not-authenticated'});
 expect(mocks.pending).not.toHaveBeenCalled();
});

test('selective cleanup never deletes unrelated browser caches or indexedDB',async()=>{
 const deleted=[];
 Object.defineProperty(window,'caches',{configurable:true,value:{
  keys:async()=>['zenos-assets-2024','workbox-precache-x','firebase-local-cache','other-app'],
  delete:async name=>{deleted.push(name);return true;},
 }});
 const result=await clearDisposableWebCaches();
 expect(result.removed).toBe(2);
 expect(deleted).toEqual(['zenos-assets-2024','workbox-precache-x']);
 expect(localStorage.getItem(CLIENT_BUILD_KEY)).toBeNull();
});

test('route mismatch opens friendly action, and operator can return to protected cart',()=>{
 installRecoveryPrompt();
 expect(dispatchRouteRecovery({code:'ZENOS_STORAGE_ROUTE_MISMATCH'})).toBe(true);
 expect(document.getElementById('zenos-recovery-prompt')).toBeTruthy();
 expect(document.body.textContent).toContain('Sincronizar e Atualizar');
 expect(document.body.textContent).toContain('Voltar ao atendimento');
 expect(dispatchRouteRecovery({code:'permission-denied'})).toBe(false);
 expect(document.querySelectorAll('#zenos-recovery-prompt')).toHaveLength(1);
 document.querySelectorAll('#zenos-recovery-prompt button')[1].click();
 expect(document.querySelectorAll('#zenos-recovery-prompt')).toHaveLength(0);
 expect(mocks.pending).not.toHaveBeenCalled();
});
