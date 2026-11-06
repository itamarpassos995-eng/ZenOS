import {Timestamp,GeoPoint} from 'firebase/firestore';
const tag='__zenosOperationalCacheType';
function encode(value){
 if(value instanceof Timestamp)return {[tag]:'timestamp',seconds:value.seconds,nanoseconds:value.nanoseconds};
 if(value instanceof GeoPoint)return {[tag]:'geopoint',latitude:value.latitude,longitude:value.longitude};
 if(Array.isArray(value))return value.map(encode);
 if(value&&typeof value==='object'){
  if(value instanceof Date)return value;
  if(tag in value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Unsupported cache value');
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]));
 }return value;
}
function decode(value){
 if(Array.isArray(value))return value.map(decode);
 if(value&&typeof value==='object'){
  if(value[tag]==='timestamp')return new Timestamp(value.seconds,value.nanoseconds);
  if(value[tag]==='geopoint')return new GeoPoint(value.latitude,value.longitude);
  if(value instanceof Date)return value;
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)]));
 }return value;
}
// Snapshot and confirmed receipt journal share one transaction domain. Never uses
// partially updated Firestore SDK pages as a transactional baseline.
const open = () => new Promise((resolve, reject) => {
 const request = indexedDB.open('zenos-operational-cache', 1);
 request.onupgradeneeded = () => request.result.createObjectStore('entries');
 request.onsuccess = () => resolve(request.result);
 request.onerror = () => reject(request.error);
 request.onblocked = () => reject(Error('Cache unavailable'));
});
const requestValue = request => new Promise((resolve,reject)=>{
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
const scopeKey = scope => JSON.stringify(scope)+':';
export const cacheScope = (project,user,generation) => [project,String(user),String(generation)];
export async function readOperationalCache(scope) {
 const db=await open();
 try {
  const prefix=scopeKey(scope), tx=db.transaction('entries','readonly');
  const values=await requestValue(tx.objectStore('entries').getAll(IDBKeyRange.bound(prefix,prefix+'\uffff')));
  const decoded=values.map(decode);
  const snapshot=decoded.find(v=>v.kind==='snapshot');
  return snapshot?{...snapshot,receipts:decoded.filter(v=>v.kind==='receipt'&&v.receipt.sequence>snapshot.sequence).map(v=>v.receipt).sort((a,b)=>a.sequence-b.sequence)}:null;
 } finally {db.close();}
}
export async function writeOperationalCache(scope,snapshot) {
 snapshot=encode(snapshot);
 const db=await open();
 try {await new Promise((resolve,reject)=>{
  const prefix=scopeKey(scope),tx=db.transaction('entries','readwrite'),store=tx.objectStore('entries');
  // A slow tab cannot replace a newer baseline or delete newer receipts.
  const existing=store.get(prefix+'snapshot');
  existing.onsuccess=()=>{
   if(existing.result?.sequence>snapshot.sequence)return;
   store.put({...snapshot,kind:'snapshot'},prefix+'snapshot');
   const cursor=store.openCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));
   cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;
    if(c.value.kind==='receipt'&&c.value.receipt.sequence<=snapshot.sequence)c.delete();c.continue();};
  };
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
 });} finally {db.close();}
}
export async function appendOperationalReceipt(scope,receipt) {
 receipt=encode(receipt);
 const db=await open();
 try {await new Promise((resolve,reject)=>{
  const tx=db.transaction('entries','readwrite');
  tx.objectStore('entries').put({kind:'receipt',receipt},scopeKey(scope)+'receipt:'+String(receipt.sequence).padStart(16,'0'));
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
 });} finally {db.close();}
}
