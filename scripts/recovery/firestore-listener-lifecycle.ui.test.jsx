import {test,expect,vi,beforeEach} from 'vitest';
const fake=vi.hoisted(()=>({listeners:[],readControl:null,cachedHead:null,cachedPages:null}));
vi.mock('firebase/firestore',()=>({
 doc:(...parts)=>({kind:'doc',parts}),
 collection:(...parts)=>({kind:'collection',parts}),
 query:(...parts)=>({kind:'query',parts}),
 where:(...parts)=>({kind:'where',parts}),
 orderBy:(...parts)=>({kind:'orderBy',parts}),
 documentId:()=>({kind:'documentId'}),
 limit:value=>({kind:'limit',value}),
 startAfter:(...parts)=>({kind:'startAfter',parts}),
 getDocsFromServer:vi.fn(async()=>({docs:[],size:0})),
 getDocsFromCache:vi.fn(async q=>fake.cachedPages?fake.cachedPages(q):{docs:[],size:0}),
 getDocFromCache:vi.fn(async()=>fake.cachedHead||{exists:()=>false}),
 getDocFromServer:vi.fn(async()=>fake.readControl?fake.readControl():{exists:()=>false}),
 onSnapshot:vi.fn((_,onData,onError)=>{
   const item={onData,onError,active:true,stops:0};
   fake.listeners.push(item);
   return()=>{item.active=false;item.stops++;};
 }),
}));
import {getDocsFromServer,getDocsFromCache} from 'firebase/firestore';
import {V2Session,subscribeOperationalSnapshot} from '../../src/core/operationalRepository.js';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const meta={fromCache:false,hasPendingWrites:false};
const blank={metadata:meta,docs:[],size:0};
const full={metadata:meta,size:100,docs:Array.from({length:100},(_,i)=>({data:()=>({sequence:i+1,patches:[],revisions:{}})}))};
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();fake.listeners.length=0;fake.readControl=null;fake.cachedHead=null;fake.cachedPages=null;});
test('dois consumidores V2 usam um listener e último cancelamento encerra apenas uma vez',()=>{
 const s=new V2Session({},'loja',{generation:'g'});
 const a=s.subscribe(()=>{},()=>{});
 const b=s.subscribe(()=>{},()=>{});
 expect(fake.listeners).toHaveLength(1);
 a();
 expect(fake.listeners[0].stops).toBe(0);
 b();b();
 expect(fake.listeners[0].stops).toBe(1);
});
test('desmontagem invalida tarefa de rearme previamente enfileirada',async()=>{
 const s=new V2Session({},'loja',{generation:'g'});
 const off=s.subscribe(()=>{},()=>{});
 fake.listeners[0].onData(full);
 off();await flush();
 expect(fake.listeners).toHaveLength(1);
 expect(fake.listeners[0].stops).toBe(1);
 expect(s.tailStop).toBeNull();
});
test('rearme antigo não cancela listener novo em desmontar/remontar no mesmo tick',async()=>{
 const s=new V2Session({},'loja',{generation:'g'});
 const oldOff=s.subscribe(()=>{},()=>{});
 fake.listeners[0].onData(full);
 oldOff();
 const off=s.subscribe(()=>{},()=>{});
 expect(fake.listeners).toHaveLength(2);
 await flush();
 expect(fake.listeners).toHaveLength(2);
 expect(fake.listeners[1].active).toBe(true);
 expect(fake.listeners[1].stops).toBe(0);
 off();
 expect(fake.listeners[1].stops).toBe(1);
});
test('cancelamento durante initializeRoute assíncrono impede instalar listeners',async()=>{
 let release;
 fake.readControl=()=>new Promise(resolve=>{release=()=>resolve({exists:()=>false});});
 const off=subscribeOperationalSnapshot({},'loja-pendente',()=>{},()=>{throw Error('callback stale');});
 off();
 expect(typeof release).toBe('function');
 release();await flush();
 expect(fake.listeners).toHaveLength(0);
});
test('listeners V1 e controle são cancelados e callbacks tardios não chegam ao componente',async()=>{
 const received=vi.fn(),errors=vi.fn();
 const off=subscribeOperationalSnapshot({},'loja-v1',received,errors);
 await flush();
 expect(fake.listeners).toHaveLength(2);
 fake.listeners[0].onData(blank);
 expect(received).toHaveBeenCalledTimes(1);
 off();off();
 expect(fake.listeners.map(x=>x.stops)).toEqual([1,1]);
 fake.listeners[0].onData(blank);
 fake.listeners[1].onError(Error('callback tardio'));
 expect(received).toHaveBeenCalledTimes(1);
 expect(errors).not.toHaveBeenCalled();
});

test('V2 reutiliza página completa do cache sem recarregar produtos do servidor',async()=>{
 const headData={schema:2,state:'ready',sourceChecksum:'origem',sequence:1,
  fieldManifest:{produtos:{kind:'array',collection:'produtos',count:1}},
  fieldCounts:{produtos:1},fieldRevisions:{}};
 const snap={exists:()=>true,data:()=>headData};
 fake.cachedHead=snap;
 fake.readControl=()=>snap;
 localStorage.setItem('zenos_v2_cache_checkpoint:unknown:loja-cache:g',JSON.stringify({
  sequence:1,sourceChecksum:'origem',
  manifest:'{"produtos":{"collection":"produtos","count":1,"kind":"array"}}',
  fieldCounts:{produtos:1},revisions:{}
 }));
 fake.cachedPages=q=>{
  const col=q.parts[0]?.parts||[];
  return col.includes('produtos')
   ? {docs:[{id:'p1',data:()=>({legacyField:'produtos',data:{id:'p1',nome:'Produto'},deleted:false})}],size:1}
   : {docs:[],size:0};
 };
 const s=new V2Session({},'loja-cache',{generation:'g',sourceChecksum:'origem'});
 await s.load();
 expect(s.materialize().produtos).toHaveLength(1);
 expect(getDocsFromCache).toHaveBeenCalled();
 expect(getDocsFromServer).not.toHaveBeenCalled();
});

test('V2 não confunde head atualizado com páginas antigas e aplica recibos pendentes',async()=>{
 const headData={schema:2,state:'ready',sourceChecksum:'origem',sequence:2,
  fieldManifest:{produtos:{kind:'array',collection:'produtos',count:1}},
  fieldCounts:{produtos:1},fieldRevisions:{}};
 const snap={exists:()=>true,data:()=>headData};
 // O SDK atualizou o head para 2, mas o cache das coleções ainda está em 1.
 fake.cachedHead=snap;fake.readControl=()=>snap;
 localStorage.setItem('zenos_v2_cache_checkpoint:unknown:loja-advance:g',JSON.stringify({
  sequence:1,sourceChecksum:'origem',
  manifest:'{"produtos":{"collection":"produtos","count":1,"kind":"array"}}',
  fieldCounts:{produtos:1},revisions:{}
 }));
 fake.cachedPages=q=>{
  const col=q.parts[0]?.parts||[];
  return col.includes('produtos')
   ?{docs:[{id:'p1',data:()=>({legacyField:'produtos',version:1,data:{id:'p1',nome:'Antes'},deleted:false})}],size:1}
   :{docs:[],size:0};
 };
 getDocsFromServer.mockImplementation(async q=>{
  const col=q.parts[0]?.parts||[];
  return col.includes('operations')?{
   docs:[{data:()=>({sequence:2,patches:[{field:'produtos',routeId:'p1',version:2,legacyIndex:0,data:{id:'p1',nome:'Atualizado'},deleted:false}],revisions:{}})}],size:1
  }:{docs:[],size:0};
 });
 const s=new V2Session({},'loja-advance',{generation:'g',sourceChecksum:'origem'});
 await s.load();
 expect(s.sequence).toBe(2);
 expect(s.materialize().produtos[0].nome).toBe('Atualizado');
 expect(getDocsFromCache).toHaveBeenCalled();
 expect(getDocsFromServer.mock.calls.every(([q])=>q.parts[0]?.parts?.includes('operations'))).toBe(true);
});
