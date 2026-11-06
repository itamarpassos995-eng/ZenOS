import {test,expect,vi,beforeEach} from 'vitest';
import 'fake-indexeddb/auto';
vi.mock('firebase/firestore',async importOriginal=>({...await importOriginal(),
 doc:vi.fn((db,...path)=>path),collection:vi.fn((db,...path)=>path),query:vi.fn((...args)=>args),
 getDocFromServer:vi.fn(),getDocFromCache:vi.fn(async()=>({exists:()=>false})),getDocsFromServer:vi.fn(),getDocsFromCache:vi.fn(),
}));
import {getDocFromServer,getDocsFromServer,getDocsFromCache} from 'firebase/firestore';
import {cacheScope,readOperationalCache,writeOperationalCache,appendOperationalReceipt} from '../../src/core/operationalCache.js';
import {V2Session,getOperationalAccessSnapshot,getOperationalSnapshot,getOperationalWriteSession} from '../../src/core/operationalRepository.js';
import {stableV2Json} from '../../src/core/operationalV2Schema.js';
let counter=0;
const fixture=()=>{
 const user='user-'+(++counter),control={generation:'g',sourceChecksum:'certified'};
 const manifest={produtos:{kind:'array',collection:'produtos',count:1}};
 const record={field:'produtos',legacyField:'produtos',routeId:'p1',version:0,data:{id:'p1',precoBRL:10}};
 const saved={sequence:0,revisions:{produtos:0},sourceChecksum:'certified',manifest:stableV2Json(manifest),fieldCounts:{produtos:1},records:[['produtos',[['p1',record]]]],values:{}};
 const head={schema:2,state:'ready',sourceChecksum:'certified',sequence:0,fieldRevisions:{produtos:0},fieldCounts:{produtos:1},fieldManifest:manifest};
 return {user,control,saved,head,scope:cacheScope('test',user,'g'),db:{app:{options:{projectId:'test'}}}};
};
const snap=data=>({exists:()=>true,data:()=>data});
beforeEach(()=>{vi.clearAllMocks();getDocsFromServer.mockRejectedValue(Error('Unexpected full download'));});
test('journal is atomic, scoped and a slow tab cannot erase a newer baseline',async()=>{
 const f=fixture();await writeOperationalCache(f.scope,f.saved);
 await appendOperationalReceipt(f.scope,{sequence:1,patches:[]});
 expect((await readOperationalCache(f.scope)).receipts).toHaveLength(1);
 await writeOperationalCache(f.scope,{...f.saved,sequence:1});
 await writeOperationalCache(f.scope,f.saved);
 expect((await readOperationalCache(f.scope)).sequence).toBe(1);
 expect(await readOperationalCache(cacheScope('other',f.user,'g'))).toBeNull();
 expect(await readOperationalCache(cacheScope('test',f.user,'new-generation'))).toBeNull();
});
test('warm reload confirms server head without any collection reads',async()=>{
 const f=fixture();await writeOperationalCache(f.scope,f.saved);getDocFromServer.mockResolvedValue(snap(f.head));
 const loaded=await new V2Session(f.db,f.user,f.control).load();
 expect(loaded.materialize().produtos[0].precoBRL).toBe(10);
 expect(getDocFromServer).toHaveBeenCalledTimes(2);
 expect(getDocsFromServer).not.toHaveBeenCalled();expect(getDocsFromCache).not.toHaveBeenCalled();
});
test('receipt journal restores a confirmed edit; missing receipts are fetched once',async()=>{
 const f=fixture();await writeOperationalCache(f.scope,f.saved);
 const patch={field:'produtos',routeId:'p1',version:1,data:{id:'p1',precoBRL:20}};
 const receipt={sequence:1,revisions:{produtos:1},patches:[patch]};
 await appendOperationalReceipt(f.scope,receipt);
 const head={...f.head,sequence:1,fieldRevisions:receipt.revisions};getDocFromServer.mockResolvedValue(snap(head));
 const loaded=await new V2Session(f.db,f.user,f.control).load();
 expect(loaded.materialize().produtos[0].precoBRL).toBe(20);expect(getDocsFromServer).not.toHaveBeenCalled();
 const receipt2={...receipt,sequence:2,revisions:{produtos:2},patches:[{...patch,version:2,data:{id:'p1',precoBRL:30}}]};
 getDocFromServer.mockResolvedValue(snap({...head,sequence:2,fieldRevisions:receipt2.revisions}));
 getDocsFromServer.mockResolvedValue({size:1,docs:[snap(receipt2)]});
 expect((await new V2Session(f.db,f.user,f.control).load()).materialize().produtos[0].precoBRL).toBe(30);
 expect(getDocsFromServer).toHaveBeenCalledOnce();
});
test('wrong generation checksum and incomplete cache never unlock operations',async()=>{
 const f=fixture();await writeOperationalCache(f.scope,{...f.saved,records:[]});getDocFromServer.mockResolvedValue(snap(f.head));
 await expect(new V2Session(f.db,f.user,f.control).load()).rejects.toThrow('Unexpected full download');
 getDocFromServer.mockResolvedValue(snap({...f.head,sourceChecksum:'wrong'}));
 await expect(new V2Session(f.db,f.user,f.control).load()).rejects.toMatchObject({code:'V2_SOURCE_MISMATCH'});
});
test('sequence gaps are rejected and cache failures cannot change confirmed memory',async()=>{
 const f=fixture(),session=new V2Session(f.db,f.user,f.control);
 expect(()=>session.apply({sequence:2,patches:[]})).toThrow();
 session.apply({sequence:1,revisions:{produtos:1},patches:[{field:'produtos',routeId:'p1',data:{id:'p1',precoBRL:22}}]});
 expect(session.materialize().produtos[0].precoBRL).toBe(22);
});
test('confirmed live operations persist to the journal for the next refresh',async()=>{
 const f=fixture();await writeOperationalCache(f.scope,f.saved);getDocFromServer.mockResolvedValue(snap(f.head));
 const session=await new V2Session(f.db,f.user,f.control).load();
 session.apply({sequence:1,revisions:{produtos:1},patches:[{field:'produtos',routeId:'p1',version:1,data:{id:'p1',precoBRL:25}}]});
 await vi.waitFor(async()=>expect((await readOperationalCache(f.scope)).receipts).toHaveLength(1));
 getDocFromServer.mockResolvedValue(snap({...f.head,sequence:1,fieldRevisions:{produtos:1}}));
 expect((await new V2Session(f.db,f.user,f.control).load()).materialize().produtos[0].precoBRL).toBe(25);
 expect(getDocsFromServer).not.toHaveBeenCalled();
});
test('newer head with a missing operation cannot use the old cache as complete',async()=>{
 const f=fixture();await writeOperationalCache(f.scope,f.saved);
 getDocFromServer.mockResolvedValue(snap({...f.head,sequence:2,fieldRevisions:{produtos:2}}));
 getDocsFromServer.mockImplementation(async q=>{
  if(q[0].at(-1)==='operations')return {size:1,docs:[snap({sequence:2,revisions:{produtos:2},patches:[]})]};
  throw Error('Rebuild blocked');
 });
 await expect(new V2Session(f.db,f.user,f.control).load()).rejects.toThrow();
});
test('Firestore timestamps survive persistent cache without changing canonical transaction values',async()=>{
 const {Timestamp,GeoPoint}=await import('firebase/firestore');
 const f=fixture(),value={time:new Timestamp(1700000000,123000000),point:new GeoPoint(-23,-54)};
 await writeOperationalCache(f.scope,{...f.saved,values:value});
 const cached=await readOperationalCache(f.scope);
 expect(cached.values.time).toBeInstanceOf(Timestamp);
 expect(stableV2Json(cached.values)).toBe(stableV2Json(value));
});

test('PIN operators arrive before a slow catalog; complete writes still wait and operator pages are reused',async()=>{
 const f=fixture(),generation='a'.repeat(24);
 const control={...f.control,generation,mode:'v2',certificate:{sourceChecksum:'certified',productionReady:true,v1WritersFenced:true,finalReconciliationPassed:true,pdvIntegrationPassed:true,rollbackPrepared:true}};
 const head={...f.head,fieldManifest:{...JSON.parse(f.saved.manifest),vendedores:{kind:'array',collection:'operadores',count:1}},fieldCounts:{produtos:1,vendedores:1},fieldRevisions:{produtos:0,vendedores:0}};
 getDocFromServer.mockImplementation(async path=>snap(path.at(-1)==='storage_control'?control:head));
 let releaseProducts;
 const slowProducts=new Promise(resolve=>{releaseProducts=resolve;});
 const calls=[];
 getDocsFromServer.mockImplementation(async q=>{
  const name=q[0].at(-1);calls.push(name);
  if(name==='operadores')return {size:1,docs:[{id:'admin',data:()=>({legacyField:'vendedores',version:0,data:{id:'admin',senha:'7953',patente:'gerencia'}})}]};
  if(name==='produtos')return slowProducts;
  return {size:0,docs:[]};
 });
 let completed=false,writeReady=false;
 const full=getOperationalSnapshot(f.db,f.user).then(x=>{completed=true;return x;});
 const access=await getOperationalAccessSnapshot(f.db,f.user);
 const write=getOperationalWriteSession(f.db,f.user).then(x=>{writeReady=true;return x;});
 expect(access.vendedores[0].id).toBe('admin');expect(completed).toBe(false);expect(writeReady).toBe(false);
 expect(calls[0]).toBe('operadores');
 releaseProducts({size:1,docs:[{id:'p1',data:()=>({legacyField:'produtos',version:0,data:{id:'p1',precoBRL:10}})}]});
 expect((await full).data().produtos[0].id).toBe('p1');await write;
 expect(calls.filter(x=>x==='operadores')).toHaveLength(1);
});
