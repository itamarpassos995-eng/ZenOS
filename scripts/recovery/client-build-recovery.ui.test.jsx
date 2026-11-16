import {test,expect,beforeEach,vi} from 'vitest';
import {checkBuildAtBootstrap,clearDisposableWebCaches,dispatchRouteRecovery,installRecoveryPrompt,CLIENT_BUILD_ID,CLIENT_BUILD_KEY} from '../../src/core/clientBuildRecovery.js';

beforeEach(()=>{
 localStorage.clear();
 sessionStorage.clear();
 document.body.innerHTML='';
 delete window.__zenosBuildRecoveryInstalled;
});

test('first boot records version without clearing operational data',async()=>{
 localStorage.setItem('zenos_pdv_pending','KEEP-ME');
 expect(await checkBuildAtBootstrap()).toBe(false);
 expect(localStorage.getItem(CLIENT_BUILD_KEY)).toBe(CLIENT_BUILD_ID);
 expect(localStorage.getItem('zenos_pdv_pending')).toBe('KEEP-ME');
});

test('selective cache cleanup preserves unrelated caches and never accesses IndexedDB',async()=>{
 const deleted=[];
 const original=window.caches;
 Object.defineProperty(window,'caches',{configurable:true,value:{
   keys:async()=>['zenos-assets-2024','workbox-precache-x','firebase-local-cache','other-app'],
   delete:async(name)=>{deleted.push(name);return true;}
 }});
 const result=await clearDisposableWebCaches();
 expect(result.removed).toBe(2);
 expect(deleted).toEqual(['zenos-assets-2024','workbox-precache-x']);
 expect(localStorage.getItem(CLIENT_BUILD_KEY)).toBeNull();
 Object.defineProperty(window,'caches',{configurable:true,value:original});
});

test('route mismatch emits recovery and never auto-retries the sale',()=>{
 installRecoveryPrompt();
 expect(dispatchRouteRecovery({code:'ZENOS_STORAGE_ROUTE_MISMATCH'})).toBe(true);
 expect(document.getElementById('zenos-recovery-prompt')).toBeTruthy();
 expect(document.body.textContent).toContain('Recarregar ZenOS');
 expect(dispatchRouteRecovery({code:'permission-denied'})).toBe(false);
 expect(document.querySelectorAll('#zenos-recovery-prompt')).toHaveLength(1);
});
