import {test,expect,vi} from 'vitest';
const sdk=vi.hoisted(()=>({subscription:null,stop:vi.fn()}));
vi.mock('firebase/firestore',()=>({
 collection:(...path)=>path,doc:vi.fn(),serverTimestamp:vi.fn(),setDoc:vi.fn(),query:vi.fn(),where:vi.fn(),getDocsFromServer:vi.fn(),
 onSnapshot:(ref,options,next)=>{sdk.subscription={ref,options,next};return sdk.stop;},
}));
import {assinarLivroFinanceiro} from '../../src/core/financialLedger.js';

test('Livro cacheado recebe confirmação do servidor mesmo sem mudança nos lançamentos',()=>{
 const onData=vi.fn();
 const stop=assinarLivroFinanceiro({db:{},userId:'emulator-store',onData});
 const subscription=sdk.subscription;
 // Reproduce the SDK contract: without this option it suppresses a second
 // event if only fromCache/hasPendingWrites changes.
 const docs=[{id:'entry',data:()=>({valor:10,createdAt:'2026-11-04'})}];
 subscription.next({docs,metadata:{fromCache:true,hasPendingWrites:false}});
 if(subscription.options.includeMetadataChanges)
  subscription.next({docs,metadata:{fromCache:false,hasPendingWrites:false}});
 expect(onData).toHaveBeenCalledTimes(2);
 expect(onData.mock.calls[0][1].fromCache).toBe(true);
 expect(onData.mock.calls[1][0]).toEqual(onData.mock.calls[0][0]);
 expect(onData.mock.calls[1][1]).toEqual({fromCache:false,hasPendingWrites:false});
 stop();expect(sdk.stop).toHaveBeenCalledOnce();
});
