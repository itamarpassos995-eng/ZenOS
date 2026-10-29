import {doc,collection,getDocFromServer,getDocFromCache,getDocsFromServer,getDocsFromCache,onSnapshot,query,orderBy,documentId,limit,startAfter,where} from 'firebase/firestore';
import {resolveV2ReadMode} from './v2ReadMode.js';
import {V2_TAIL_WINDOW_SIZE,shouldRearmV2Tail} from './v2TailWindow.js';
import {V2_COLLECTIONS,encodeV2Id,entityIdV2,v2ControlPath,v2RootPath,v2Error,stableV2Json,hashV2} from './operationalV2Schema.js';

const sessions=new WeakMap();
const sessionMap=db=>{if(!sessions.has(db))sessions.set(db,new Map());return sessions.get(db);};
export const getShadowReadStatus=(db,userId)=>sessionMap(db).get(String(userId))?.shadowStatus||null;
export const peekV2Session=(db,userId)=>db&&sessionMap(db).get(String(userId))?.session||null;
const PAGE=50,MAX_DOCUMENTS=20000;
const asSnapshot=data=>({exists:()=>true,data:()=>data,metadata:{fromCache:false,hasPendingWrites:false}});

export class V2Session {
 constructor(db,userId,control){this.db=db;this.userId=String(userId);this.control=control;this.generation=control.generation;
  this.root=v2RootPath(userId,control.generation);this.records=new Map();this.values={};this.sequence=0;this.revisions={};this.listeners=new Set();this.tailStop=null;this.tailEpoch=0;this.failed=null;}
 async paged(path,consume,{cacheOnly=false}={}){let cursor=null;
  do{const q=query(collection(this.db,...path),orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),limit(PAGE));
   const page=await (cacheOnly?getDocsFromCache(q):getDocsFromServer(q));
   if(!cacheOnly){
    this.reads=(this.reads||0)+page.size;
    if(this.reads>MAX_DOCUMENTS)throw v2Error('V2_READ_BUDGET','Leitura inicial excedeu o limite de documentos.');
   }
   page.docs.forEach(consume);cursor=page.size===PAGE?page.docs.at(-1):null;
  }while(cursor);
 }
 materialize(){const data={...this.values};
  for(const field of Object.keys(V2_COLLECTIONS))data[field]=[...(this.records.get(field)||new Map()).values()]
   .filter(v=>!v.deleted).sort((a,b)=>(Number(a.legacyIndex||0)-Number(b.legacyIndex||0))||String(a.routeId).localeCompare(String(b.routeId))).map(v=>v.data);
  data._syncMeta={...(data._syncMeta||{}),fieldRevisions:{...this.revisions},v2Sequence:this.sequence};return data;
 }
 apply(receipt,{emit=true}={}){
  if(receipt.sequence<=this.sequence)return;
  if(receipt.sequence!==this.sequence+1)throw v2Error('V2_SEQUENCE_GAP','Há uma operação ausente na sincronização; escritas bloqueadas.');
  for(const p of receipt.patches||[]){
   if(V2_COLLECTIONS[p.field]){
    if(!this.records.has(p.field))this.records.set(p.field,new Map());
    this.records.get(p.field).set(p.routeId,{...p});
   }else this.values[p.field]=p.value;
  }
  this.sequence=receipt.sequence;this.revisions={...receipt.revisions};
  if(emit)for(const l of this.listeners)l.data(asSnapshot(this.materialize()));
 }
 async catchUp(){let pages=0;
  while(true){if(++pages>100)throw v2Error('V2_TAIL_BUDGET','Sincronização exige recarga controlada.');
   const page=await getDocsFromServer(query(collection(this.db,...this.root,'operations'),where('sequence','>',this.sequence),orderBy('sequence'),limit(100)));
   page.docs.forEach(d=>this.apply(d.data()));
   if(page.size<100)break;
  }
 }
 // A checagem continua autoritativa no servidor; somente elimina buscas
 // repetidas de páginas de operações quando a sequência não avançou.
 // Chamadas simultâneas compartilham a mesma verificação remota.
 async catchUpIfBehind(){
  if(this.failed)throw this.failed;
  if(this.catchUpCheckPromise)return this.catchUpCheckPromise;
  const pending=(async()=>{
   const head=await getDocFromServer(doc(this.db,...this.root));
   const info=head.exists()?head.data():null;
   if(!info||info.schema!==2||info.state!=='ready')throw v2Error('V2_NOT_READY','Cópia V2 indisponível para confirmação.');
   if(info.sourceChecksum!==this.control.sourceChecksum)throw v2Error('V2_SOURCE_MISMATCH','A geração V2 não corresponde à cópia certificada.');
   const remoteSequence=Number(info.sequence);
   if(!Number.isSafeInteger(remoteSequence)||remoteSequence<0||remoteSequence<this.sequence)
    throw v2Error('V2_HEAD_SEQUENCE','Cabeçalho V2 inconsistente; confirmação bloqueada.');
   if(remoteSequence===this.sequence)return;
   await this.catchUp();
   if(this.sequence<remoteSequence)throw v2Error('V2_NOT_CAUGHT_UP','Não foi possível conferir operações pendentes no servidor.');
  })();
  this.catchUpCheckPromise=pending;
  try{return await pending;}finally{if(this.catchUpCheckPromise===pending)this.catchUpCheckPromise=null;}
 }
 // A carga inicial usa primeiro a cópia persistida, mas somente quando a
 // geração, o manifesto e as contagens conferem. Dados incompletos nunca
 // são usados como base para operações financeiras.
 async hydrateCollections(manifest,{cacheOnly=false}={}){
  this.records=new Map();this.values={};
  for(const [field,meta] of Object.entries(manifest)){
   if(meta.kind!=='array')continue;
   if(!V2_COLLECTIONS[field]||meta.collection!==V2_COLLECTIONS[field])throw v2Error('V2_UNKNOWN_FIELD',`Campo V2 não integrado: ${field}.`);
   const records=new Map();this.records.set(field,records);
   await this.paged([...this.root,meta.collection],snap=>{
    const value=snap.data();if(value.legacyField!==field||value.data===undefined)throw v2Error('V2_ENTITY_SCHEMA','Registro V2 inválido.');
    if(encodeV2Id(entityIdV2(field,value.data))!==snap.id)throw v2Error('V2_ENTITY_ID','ID V2 difere do legado.');
    records.set(snap.id,{...value,routeId:snap.id});
   },{cacheOnly});
  }
  await this.paged([...this.root,'legacy_fields'],snap=>{
   const value=snap.data();if(typeof value.field!=='string'||value.value===undefined)throw v2Error('V2_VALUE_SCHEMA','Campo legado inválido.');
   this.values[value.field]=value.value;
  },{cacheOnly});
 }
 assertComplete(manifest,counts){
  for(const [field,meta] of Object.entries(manifest)){
   if(meta.kind==='array'){
    const expected=Number(counts?.[field]??meta.count);
    const records=this.records.get(field);
    const actual=[...(records?.values()||[])].filter(v=>!v.deleted).length;
    if(!Number.isSafeInteger(expected)||expected<0||actual!==expected)
     throw v2Error('V2_COUNT_MISMATCH','Contagem da cópia difere do manifesto confirmado.');
   }else if(!Object.prototype.hasOwnProperty.call(this.values,field)){
    throw v2Error('V2_CACHE_INCOMPLETE','Campo operacional não está disponível no cache.');
   }
  }
 }
 async load(){
  const headRef=doc(this.db,...this.root);
  // Ler o head em cache ANTES da checagem remota: a consulta ao servidor
  // atualizaria a versão local e apagaria a sequência de referência antiga.
  const cachedHead=await getDocFromCache(headRef).catch(()=>null);
  const head=await getDocFromServer(headRef);
  if(!head.exists()||head.data().schema!==2||head.data().state!=='ready')throw v2Error('V2_NOT_READY','Cópia V2 ainda não foi certificada.');
  if(head.data().sourceChecksum!==this.control.sourceChecksum)throw v2Error('V2_SOURCE_MISMATCH','Origem da cópia não corresponde à ativação.');
  const authoritative=head.data(),manifest=authoritative.fieldManifest;
  if(!manifest||!Object.keys(manifest).length)throw v2Error('V2_MANIFEST','Manifesto V2 ausente.');
  this.manifest=manifest;this.reads=0;
  const cached=cachedHead?.exists()?cachedHead.data():null;
  const previousSequence=Number(cached?.sequence),remoteSequence=Number(authoritative.sequence);
  const reuseCache=!!cached&&cached.schema===2&&cached.state==='ready'
   &&cached.sourceChecksum===this.control.sourceChecksum
   &&JSON.stringify(cached.fieldManifest)===JSON.stringify(manifest)
   &&Number.isSafeInteger(previousSequence)&&previousSequence>=0
   &&Number.isSafeInteger(remoteSequence)&&previousSequence<=remoteSequence;
  if(reuseCache){
   try{
    this.sequence=previousSequence;this.revisions={...(cached.fieldRevisions||{})};
    await this.hydrateCollections(manifest,{cacheOnly:true});
    this.assertComplete(manifest,cached.fieldCounts);
    if(this.sequence<remoteSequence)await this.catchUp();
    const end=await getDocFromServer(headRef);
    if(!end.exists()||end.data().state!=='ready')throw v2Error('V2_NOT_READY','Cópia V2 indisponível.');
    const finalSequence=Number(end.data().sequence);
    if(this.sequence<finalSequence)await this.catchUp();
    if(this.sequence!==finalSequence||!Number.isSafeInteger(finalSequence))
     throw v2Error('V2_NOT_CAUGHT_UP','Não foi possível conferir operações pendentes no servidor.');
    this.assertComplete(manifest,end.data().fieldCounts);
    if(JSON.stringify(this.revisions)!==JSON.stringify(end.data().fieldRevisions||{}))
     throw v2Error('V2_REVISION_MISMATCH','Revisões da cópia divergentes.');
    return this;
   }catch(error){
    // Cache parcial ou fora de sincronia: nunca liberar o PDV com dados incompletos.
    // Reconstruir pelo caminho autoritativo já existente, sem alterar a produção.
    this.records=new Map();this.values={};this.reads=0;
    console.warn('[ZenOS][V2] Cache incompleto; recarregando dados certificados:',error?.code||error?.message);
   }
  }
  this.sequence=Number(authoritative.sequence||0);this.revisions={...(authoritative.fieldRevisions||{})};
  await this.hydrateCollections(manifest);
  await this.catchUp();
  const end=await getDocFromServer(headRef);
  if(Number(end.data()?.sequence||0)!==this.sequence)await this.catchUp();
  if(Number(end.data()?.sequence||0)===this.sequence)this.assertComplete(manifest,end.data().fieldCounts);
  if(this.sequence<Number(end.data()?.sequence||0))throw v2Error('V2_NOT_CAUGHT_UP','Não foi possível sincronizar todas as operações.');
  return this;
 }
 // Invalida também callbacks/microtasks de uma assinatura já cancelada.
 stopTail(){this.tailEpoch++;const stop=this.tailStop;this.tailStop=null;stop?.();}
 startTail(){
  if(this.tailStop||!this.listeners.size||this.failed)return;
  const epoch=++this.tailEpoch,captured=this.sequence;
  let rearmQueued=false;
  this.tailStop=onSnapshot(query(collection(this.db,...this.root,'operations'),where('sequence','>',captured),orderBy('sequence'),limit(V2_TAIL_WINDOW_SIZE)),snap=>{
   if(epoch!==this.tailEpoch||!this.listeners.size||this.failed)return;
   if(snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
   try{
    snap.docs.forEach(d=>this.apply(d.data()));
    if(shouldRearmV2Tail(snap.size,captured,this.sequence)&&!rearmQueued){
     rearmQueued=true;
     queueMicrotask(()=>{
      if(epoch!==this.tailEpoch||!this.listeners.size||this.failed)return;
      this.stopTail();
      this.startTail();
     });
    }
   }catch(e){this.fail(e);}
  },e=>{if(epoch===this.tailEpoch&&this.listeners.size)this.fail(e);});
 }
 fail(error){this.failed=error;this.stopTail();for(const l of this.listeners)l.error?.(error);}
 subscribe(onData,onError){const l={data:onData,error:onError};this.listeners.add(l);onData(asSnapshot(this.materialize()));this.startTail();
  let closed=false;
  return()=>{if(closed)return;closed=true;this.listeners.delete(l);if(!this.listeners.size)this.stopTail();};
 }
}

export async function getOperationalSnapshot(db,userId){
 const entry=await initializeRoute(db,userId);
 if(entry.session){if(entry.session.failed)throw entry.session.failed;await entry.session.catchUpIfBehind();return asSnapshot(entry.session.materialize());}
 const snap=await getDocFromServer(doc(db,'lojas',String(userId),'dados','operacao'));
 if(entry.route.shadow)await compareShadow(entry,snap);
 return snap;
}
async function initializeRoute(db,userId){
 const map=sessionMap(db),key=String(userId);let entry=map.get(key);
 if(!entry){entry={session:null,promise:null};map.set(key,entry);
  entry.promise=(async()=>{
   const controlSnap=await getDocFromServer(doc(db,...v2ControlPath(userId)));const control=controlSnap.exists()?controlSnap.data():null;
   const route=resolveV2ReadMode(control);entry.control=control;entry.route=route;
   if(route.shadow)entry.shadowSession=await new V2Session(db,userId,control).load();
   if(route.primary==='v2')entry.session=await new V2Session(db,userId,control).load();
   return entry;
  })().catch(error=>{map.delete(key);throw error;});
 }return entry.promise;
}
export function subscribeOperationalSnapshot(db,userId,onData,onError){
 let disposed=false,stopData=null,stopControl=null;
 const reportError=error=>{if(!disposed)onError?.(error);};
 const emitData=snapshot=>{if(!disposed)onData?.(snapshot);};
 void initializeRoute(db,userId).then(entry=>{
  if(disposed)return;
  stopData=entry.session
   ?entry.session.subscribe(emitData,reportError)
   :onSnapshot(doc(db,'lojas',String(userId),'dados','operacao'),snap=>{
     if(disposed)return;
     emitData(snap);
     if(entry.route.shadow&&!snap.metadata.fromCache&&!snap.metadata.hasPendingWrites)
      void compareShadow(entry,snap).catch(reportError);
    },reportError);
  // Se o componente tiver desmontado durante a assinatura inicial, não abrir outra.
  if(disposed){stopData?.();stopData=null;return;}
  stopControl=onSnapshot(doc(db,...v2ControlPath(userId)),snap=>{
   if(disposed||snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
   const next=snap.exists()?snap.data():null;
   if(JSON.stringify(next)!==JSON.stringify(entry.control)){
    stopData?.();stopData=null;
    entry.session?.fail(v2Error('V2_ROUTE_CHANGED','Armazenamento mudou; recarregue o sistema antes de operar.'));
    reportError(v2Error('V2_ROUTE_CHANGED','Armazenamento mudou; recarregue o sistema antes de operar.'));
   }
  },reportError);
  if(disposed){stopControl?.();stopControl=null;}
 }).catch(reportError);
 return()=>{if(disposed)return;disposed=true;stopData?.();stopControl?.();stopData=null;stopControl=null;};
}
export function clearOperationalSession(db,userId){
 const entry=sessionMap(db).get(String(userId));entry?.session?.stopTail();sessionMap(db).delete(String(userId));
}

async function compareShadow(entry,snapshot){
 if(!snapshot.exists())throw v2Error('V2_SHADOW_SOURCE','Origem V1 ausente.');
 await entry.shadowSession.catchUp();
 const legacy=snapshot.data(),v2=entry.shadowSession.materialize();
 const normalize=(value,field)=>field==='_syncMeta'?Object.fromEntries(Object.entries(value||{}).filter(([k])=>k!=='v2Sequence')):value;
 const differences=[];const hashes={};
 for(const field of new Set([...Object.keys(legacy),...Object.keys(v2)])){
  // Materialization supplies empty optional arrays for the UI. Absent and empty
  // are equivalent only for these known fields, never for unknown legacy maps.
  const a=normalize(legacy[field]??(V2_COLLECTIONS[field]?[]:undefined),field),b=normalize(v2[field],field);
  const equal=stableV2Json(a)===stableV2Json(b);if(!equal)differences.push(field);
  hashes[field]={legacy:await hashV2(stableV2Json(a)??'undefined'),v2:await hashV2(stableV2Json(b)??'undefined')};
 }
 entry.shadowStatus={generation:entry.control.generation,checkedAt:new Date().toISOString(),equal:differences.length===0,differences,hashes,readOnlyComparison:true};
 return entry.shadowStatus;
}
