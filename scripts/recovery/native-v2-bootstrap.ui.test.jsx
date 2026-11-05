import {beforeEach,test,expect,vi} from 'vitest';

const mock=vi.hoisted(()=>({reads:[],control:null,legacy:null,enabled:true,provision:vi.fn()}));
vi.mock('firebase/firestore',()=>({
 doc:(_db,...parts)=>parts.join('/'),collection:vi.fn(),getDocFromCache:vi.fn(),getDocsFromServer:vi.fn(),getDocsFromCache:vi.fn(),onSnapshot:vi.fn(),query:vi.fn(),orderBy:vi.fn(),documentId:vi.fn(),limit:vi.fn(),startAfter:vi.fn(),where:vi.fn(),Timestamp:class{},
 getDocFromServer:async path=>{mock.reads.push(path);const data=path.endsWith('storage_control')?mock.control:mock.legacy;return {exists:()=>data!==null,data:()=>data};},
}));
vi.mock('../../src/core/nativeV2Provisioning.js',()=>({nativeV2Enabled:()=>mock.enabled,provisionNativeV2Store:()=>mock.provision()}));
import {getOperationalSnapshot,getOperationalWriteSession,clearOperationalSession} from '../../src/core/operationalRepository.js';
const db={};
beforeEach(()=>{clearOperationalSession(db,'company');mock.reads=[];mock.control=null;mock.legacy=null;mock.enabled=true;mock.provision.mockReset();});

test('legacy boot reuses its point read and never provisions an existing store',async()=>{
 mock.legacy={clientes:[{id:'keep'}]};
 expect((await getOperationalSnapshot(db,'company')).data()).toEqual(mock.legacy);
 expect(mock.reads).toHaveLength(2);expect(mock.provision).not.toHaveBeenCalled();
 expect(await getOperationalWriteSession(db,'company')).toBeNull();
});
test('disabled release preserves existing empty-store behavior without a callable',async()=>{
 mock.enabled=false;expect((await getOperationalSnapshot(db,'company')).exists()).toBe(false);
 expect(mock.reads).toHaveLength(2);expect(mock.provision).not.toHaveBeenCalled();
});
test('provisioning failure blocks both boot and a cold write without legacy fallback',async()=>{
 mock.provision.mockRejectedValue(new Error('Provisioning unavailable'));
 await expect(getOperationalSnapshot(db,'company')).rejects.toThrow('Provisioning unavailable');
 await expect(getOperationalWriteSession(db,'company')).rejects.toThrow('Provisioning unavailable');
 expect(mock.reads.filter(p=>p.endsWith('operacao'))).toHaveLength(2);
});
test('concurrent boot/write share one provisioning attempt and reject an unconfirmed route',async()=>{
 mock.provision.mockResolvedValue({status:'created'});
 const results=await Promise.allSettled([getOperationalSnapshot(db,'company'),getOperationalWriteSession(db,'company')]);
 expect(results.every(x=>x.status==='rejected')).toBe(true);expect(mock.provision).toHaveBeenCalledTimes(1);
});
