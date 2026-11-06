/** Per tenant/operator persistent outbox. No PIN, session, token or implicit rebase. */
export function createDriverStore(tenantId,operatorId,{indexedDB=globalThis.indexedDB,now=()=>Date.now(),uuid=()=>crypto.randomUUID()}={}){
 const namespace=JSON.stringify([tenantId,operatorId]);let connection,flight;
 const open=()=>connection||(connection=new Promise((resolve,reject)=>{const request=indexedDB.open('zenos-distribution-driver-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('records',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}));
 const transact=async(mode,fn)=>{const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('records',mode),store=tx.objectStore('records');let result;try{result=fn(store);}catch(e){reject(e);return;}tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('LOCAL_STORAGE_FAILED'));});};
 const all=async()=>{let result;await transact('readonly',s=>{const r=s.getAll();r.onsuccess=()=>{result=r.result.filter(x=>x.namespace===namespace);};});return result;};
 const put=value=>transact('readwrite',s=>s.put(value));
 const pending=async()=> (await all()).filter(r=>r.kind==='command').sort((a,b)=>a.sequence-b.sequence);
 return {
  pending,
  async cache(trip,options={}){await put({id:namespace+':trip:'+trip.id,namespace,kind:'cache',trip:structuredClone(trip),options,at:now()});},
  async cached(tripId){return (await all()).find(r=>r.kind==='cache'&&r.trip.id===tripId);},
  async cachedTrips(){return (await all()).filter(r=>r.kind==='cache').map(r=>r.trip);},
  async enqueue(trip,type,payload){
   const queued=(await pending()).filter(r=>r.input.tripId===trip.id);if(queued.some(r=>r.status==='CONFLICT'))throw Object.assign(Error('QUEUE_CONFLICT'),{code:'QUEUE_CONFLICT'});
   if(queued.length>=60)throw Object.assign(Error('QUEUE_FULL'),{code:'QUEUE_FULL'});
   const key=uuid(),record={id:namespace+':command:'+key,namespace,kind:'command',status:'PENDING',sequence:now()*1000+queued.length,input:{type,tripId:trip.id,expectedRevision:queued.length?queued.at(-1).input.expectedRevision+1:trip.revision,payload:structuredClone(payload),key,clientAt:new Date(now()).toISOString()},createdAt:now()};
   await put(record);return record;
  },
  sync(send){if(flight)return flight;flight=(async()=>{let confirmed=0;for(const record of await pending()){
   if(record.status==='CONFLICT')break;
   try{const acknowledgement=await send(record.input);if(!Number.isSafeInteger(acknowledgement?.revision))throw Error('INVALID_ACK');await transact('readwrite',s=>s.delete(record.id));confirmed++;}
   catch(e){const code=e.code||'';if(code&&!['UNAUTHENTICATED','SESSION_EXPIRED','RATE_LIMITED'].includes(code)){await put({...record,status:'CONFLICT',error:code});}throw e;}
  }return {confirmed};})().finally(()=>{flight=null;});return flight;},
  async discard(tripId,reason){if(!reason?.trim())throw Error('DISCARD_REASON_REQUIRED');for(const record of (await pending()).filter(r=>r.input.tripId===tripId)){await put({...record,kind:'discarded',discardReason:reason.trim(),discardedAt:now()});}},
  async close(){if(connection)(await connection).close();connection=null;},
 };
}
