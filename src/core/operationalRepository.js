import {doc,collection,getDocFromServer,getDocsFromServer,onSnapshot,query,orderBy,documentId,limit,startAfter,where} from 'firebase/firestore';
import {resolveV2ReadMode} from './v2ReadMode.js';
import {V2_COLLECTIONS,encodeV2Id,entityIdV2,v2ControlPath,v2RootPath,v2Error,stableV2Json,hashV2} from './operationalV2Schema.js';

const sessions=new WeakMap();
const sessionMap=db=>{if(!sessions.has(db))sessions.set(db,new Map());return sessions.get(db);};
export const getShadowReadStatus=(db,userId)=>sessionMap(db).get(String(userId))?.shadowStatus||null;
export const peekV2Session=(db,userId)=>db&&sessionMap(db).get(String(userId))?.session||null;
const PAGE=200,MAX_DOCUMENTS=20000;
const asSnapshot=data=>({exists:()=>true,data:()=>data,metadata:{fromCache:false,hasPendingWrites:false}});

export class V2Session {
 constructor(db,userId,control){this.db=db;this.userId=String(userId);this.control=control;this.generation=control.generation;
  this.root=v2RootPath(userId,control.generation);this.records=new Map();this.values={};this.sequence=0;this.revisions={};this.listeners=new Set();this.tailStop=null;this.failed=null;}
 async paged(path,consume){let cursor=null,count=0;
  do{const q=query(collection(this.db,...path),orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),limit(PAGE));
   const page=await getDocsFromServer(q);count+=page.size;this.reads=(this.reads||0)+page.size;
   if(this.reads>MAX_DOCUMENTS)throw v2Error('V2_READ_BUDGET','Leitura inicial excedeu o limite de documentos.');
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
 async load(){
  const head=await getDocFromServer(doc(this.db,...this.root));
  if(!head.exists()||head.data().schema!==2||head.data().state!=='ready')throw v2Error('V2_NOT_READY','Cópia V2 ainda não foi certificada.');
  if(head.data().sourceChecksum!==this.control.sourceChecksum)throw v2Error('V2_SOURCE_MISMATCH','Origem da cópia não corresponde à ativação.');
  this.sequence=Number(head.data().sequence||0);this.revisions={...(head.data().fieldRevisions||{})};this.reads=0;
  const manifest=head.data().fieldManifest;this.manifest=manifest;
  if(!manifest||!Object.keys(manifest).length)throw v2Error('V2_MANIFEST','Manifesto V2 ausente.');
  // Sequential bounded pages avoid many simultaneous full-catalog queries.
  for(const [field,meta] of Object.entries(manifest)){
   if(meta.kind==='array'){
    if(!V2_COLLECTIONS[field]||meta.collection!==V2_COLLECTIONS[field])throw v2Error('V2_UNKNOWN_FIELD',`Campo V2 não integrado: ${field}.`);
    const records=new Map();this.records.set(field,records);
    await this.paged([...this.root,meta.collection],snap=>{
     const value=snap.data();if(value.legacyField!==field||value.data===undefined)throw v2Error('V2_ENTITY_SCHEMA','Registro V2 inválido.');
     if(encodeV2Id(entityIdV2(field,value.data))!==snap.id)throw v2Error('V2_ENTITY_ID','ID V2 difere do legado.');
     records.set(snap.id,{...value,routeId:snap.id});
    });
   }
  }
  await this.paged([...this.root,'legacy_fields'],snap=>{
   const value=snap.data();if(typeof value.field!=='string'||value.value===undefined)throw v2Error('V2_VALUE_SCHEMA','Campo legado inválido.');
   this.values[value.field]=value.value;
  });
  await this.catchUp();
  const end=await getDocFromServer(doc(this.db,...this.root));
  if(Number(end.data()?.sequence||0)!==this.sequence)await this.catchUp();
  if(Number(end.data()?.sequence||0)===this.sequence){
   const counts=end.data().fieldCounts||Object.fromEntries(Object.entries(manifest).filter(([,m])=>m.kind==='array').map(([f,m])=>[f,m.count]));
   for(const [field,count] of Object.entries(counts))if([...this.records.get(field)?.values()||[]].filter(v=>!v.deleted).length!==count)throw v2Error('V2_COUNT_MISMATCH','Contagem da cópia difere do manifesto confirmado.');
  }
  if(this.sequence<Number(end.data()?.sequence||0))throw v2Error('V2_NOT_CAUGHT_UP','Não foi possível sincronizar todas as operações.');
  return this;
 }
 startTail(){if(this.tailStop||!this.listeners.size||this.failed)return;
  let rearming=false;
  const attach=()=>{if(!this.listeners.size||this.failed)return;
   const captured=this.sequence;
   this.tailStop=onSnapshot(query(collection(this.db,...this.root,'operations'),where('sequence','>',captured),orderBy('sequence'),limit(100)),snap=>{
    if(snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
    try{snap.docs.forEach(d=>this.apply(d.data()));
     if(this.sequence>captured&&!rearming){rearming=true;queueMicrotask(()=>{this.tailStop?.();this.tailStop=null;rearming=false;attach();});}
    }catch(e){this.fail(e);}
   },e=>this.fail(e));
  };attach();
 }
 fail(error){this.failed=error;this.tailStop?.();this.tailStop=null;for(const l of this.listeners)l.error?.(error);}
 subscribe(onData,onError){const l={data:onData,error:onError};this.listeners.add(l);onData(asSnapshot(this.materialize()));this.startTail();
  return()=>{this.listeners.delete(l);if(!this.listeners.size){this.tailStop?.();this.tailStop=null;}};
 }
}

export async function getOperationalSnapshot(db,userId){
 const entry=await initializeRoute(db,userId);
 if(entry.session){if(entry.session.failed)throw entry.session.failed;await entry.session.catchUp();return asSnapshot(entry.session.materialize());}
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
 void initializeRoute(db,userId).then(entry=>{
  if(disposed)return;
  stopData=entry.session?entry.session.subscribe(onData,onError):onSnapshot(doc(db,'lojas',String(userId),'dados','operacao'),snap=>{onData(snap);if(entry.route.shadow&&!snap.metadata.fromCache&&!snap.metadata.hasPendingWrites)void compareShadow(entry,snap).catch(onError);},onError);
  stopControl=onSnapshot(doc(db,...v2ControlPath(userId)),snap=>{
   if(snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
   const next=snap.exists()?snap.data():null;
   if(JSON.stringify(next)!==JSON.stringify(entry.control)){
    stopData?.();entry.session?.fail(v2Error('V2_ROUTE_CHANGED','Armazenamento mudou; recarregue o sistema antes de operar.'));
    onError?.(v2Error('V2_ROUTE_CHANGED','Armazenamento mudou; recarregue o sistema antes de operar.'));
   }
  },onError);
 }).catch(onError);
 return()=>{disposed=true;stopData?.();stopControl?.();};
}
export function clearOperationalSession(db,userId){
 const entry=sessionMap(db).get(String(userId));entry?.session?.tailStop?.();sessionMap(db).delete(String(userId));
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
