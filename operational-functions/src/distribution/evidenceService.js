import {hash,id,error} from './security.js';
import {decodePrivateEvidence,localPrivateEvidenceStore} from './privateEvidence.js';
const keyOk=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,120}$/.test(v);
const ALLOWED=Object.freeze({PHOTO:['image/png','image/jpeg'],SIGNATURE:['image/png','image/jpeg'],DOCUMENT:['image/png','image/jpeg','application/pdf']});
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
/** Local emulator-only private evidence API. Never exposed as a public blob URL. */
export function buildOccurrenceEvidence({db,ctx,authorize,now=()=>Date.now(),storage=localPrivateEvidenceStore()}) {
 const rootDoc=(c,collection,key)=>db.doc(`${c.root}/${collection}/${id(key)}`);
 async function occurrenceEvidenceUpload(uid,sessionToken,input) {
  if(![input?.occurrenceId,input?.id,input?.key].every(keyOk)||
    !Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||
    !ALLOWED[input.kind]?.includes(input.mediaType))error('INVALID_EVIDENCE_COMMAND');
  const bytes=decodePrivateEvidence(input.base64,input.mediaType);
  const fingerprint=hash(stable({tenantId:uid,occurrenceId:input.occurrenceId,id:input.id,
    key:input.key,kind:input.kind,mediaType:input.mediaType,sha256:hash(bytes)}));
  const stored=await storage.stage({tenantId:uid,occurrenceId:input.occurrenceId,
    evidenceId:input.id,bytes,mediaType:input.mediaType});
  try {
   return await db.runTransaction(async tx=>{
    const c=await ctx(tx,uid);
    const actor=await authorize(tx,uid,sessionToken,c,'returns');
    const occurrenceRef=rootDoc(c,'distribution_occurrences',input.occurrenceId),
      receiptRef=rootDoc(c,'distribution_evidence_receipts',hash(input.key)),
      evidenceRef=rootDoc(c,'distribution_evidence',hash(input.id));
    const [oSnap,rSnap,eSnap]=await Promise.all([tx.get(occurrenceRef),tx.get(receiptRef),tx.get(evidenceRef)]);
    const receipt=rSnap.data();
    if(receipt){
     if(receipt.fingerprint!==fingerprint||receipt.operatorId!==actor.operatorId||
        receipt.generation!==c.generation)error('IDEMPOTENCY_CONFLICT');
     return {...receipt.result,replayed:true};
    }
    const original=oSnap.data();
    if(!original||original.generation!==c.generation||original.tenantId!==uid)
      error('OCCURRENCE_NOT_FOUND');
    if(original.revision!==input.expectedRevision)error('REVISION_CONFLICT');
    if(eSnap.exists||original.evidence?.some(e=>e.id===input.id))error('EVIDENCE_ID_COLLISION');
    if((original.evidence||[]).length>=12)error('EVIDENCE_LIMIT');
    const at=new Date(now()).toISOString();
    const evidence={id:input.id,kind:input.kind,reference:stored.key,
      mediaType:stored.mediaType,sha256:stored.sha256,bytes:stored.bytes,
      status:'ACTIVE',uploadedBy:actor.operatorId,uploadedAt:at};
    const eventId=hash(`occ-evidence:${uid}:${input.key}`);
    const updated={...original,revision:original.revision+1,updatedAt:now(),
      updatedBy:actor.operatorId,evidence:[...(original.evidence||[]),evidence],
      history:[...original.history,{eventId,domain:'evidence',from:null,to:'ACTIVE',actorId:actor.operatorId,at,note:'PRIVATE_EVIDENCE_UPLOADED'}]};
    if(Buffer.byteLength(JSON.stringify(updated))>650000)error('REQUEST_TOO_LARGE');
    const sequence=c.head.sequence+1;
    const result={occurrenceId:original.id,evidenceId:input.id,revision:updated.revision,status:'ACTIVE'};
    tx.set(occurrenceRef,updated);
    tx.create(evidenceRef,{...evidence,tenantId:uid,occurrenceId:original.id,
      generation:c.generation,createdAt:now()});
    tx.create(receiptRef,{fingerprint,operatorId:actor.operatorId,generation:c.generation,result});
    tx.create(rootDoc(c,'distribution_occurrence_events',eventId),{id:eventId,tenantId:uid,
      occurrenceId:original.id,revision:updated.revision,operatorId:actor.operatorId,
      serverAt:now(),type:'PRIVATE_EVIDENCE_UPLOADED',payload:{evidenceId:input.id,sha256:stored.sha256}});
    tx.create(rootDoc(c,'distribution_outbox',eventId),{schema:1,id:eventId,tenantId:uid,
      type:'distribution.occurrence.evidence.v1',entityId:original.id,
      payload:{occurrenceId:original.id,evidenceId:input.id},state:'LOCAL_ONLY',occurredAt:at});
    tx.update(db.doc(c.base),{sequence,lastReceipt:eventId});
    return result;
   },{maxAttempts:15});
  }catch(e){
   // An emulator crash could still leave an unreferenced private object.
   // No public access is possible; periodic orphan cleanup remains a production gate.
   if(stored.created)await storage.discard({tenantId:uid,occurrenceId:input.occurrenceId,evidenceId:input.id});
   throw e;
  }
 }
 async function occurrenceEvidenceRead(uid,sessionToken,input) {
  if(!keyOk(input?.occurrenceId)||!keyOk(input?.id))error('INVALID_EVIDENCE_COMMAND');
  const metadata=await db.runTransaction(async tx=>{
   const c=await ctx(tx,uid);
   await authorize(tx,uid,sessionToken,c,'tripView');
   const [occ,doc]=await Promise.all([
    tx.get(rootDoc(c,'distribution_occurrences',input.occurrenceId)),
    tx.get(rootDoc(c,'distribution_evidence',hash(input.id)))]);
   if(!occ.exists||occ.data().tenantId!==uid||occ.data().generation!==c.generation||
      !doc.exists||doc.data().tenantId!==uid||
      doc.data().occurrenceId!==input.occurrenceId||
      doc.data().generation!==c.generation||
      doc.data().status!=='ACTIVE')error('EVIDENCE_NOT_FOUND');
   return {sha256:doc.data().sha256,mediaType:doc.data().mediaType};
  });
  const bytes=await storage.read({tenantId:uid,occurrenceId:input.occurrenceId,
    evidenceId:input.id,sha256:metadata.sha256});
  return {id:input.id,mediaType:metadata.mediaType,base64:bytes.toString('base64')};
 }
 async function occurrenceEvidenceInvalidate(uid,sessionToken,input) {
  if(![input?.occurrenceId,input?.id,input?.key].every(keyOk)||
    !Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||
    typeof input.reason!=='string'||input.reason.trim().length<6||
    input.reason.length>300)error('INVALID_EVIDENCE_COMMAND');
  const identity=hash(stable({tenantId:uid,...input}));
  return db.runTransaction(async tx=>{
   const c=await ctx(tx,uid),actor=await authorize(tx,uid,sessionToken,c,'manage');
   const occRef=rootDoc(c,'distribution_occurrences',input.occurrenceId),
     evidenceRef=rootDoc(c,'distribution_evidence',hash(input.id)),
     receiptRef=rootDoc(c,'distribution_evidence_receipts',hash(input.key));
   const [occSnap,evSnap,receiptSnap]=await Promise.all([tx.get(occRef),tx.get(evidenceRef),tx.get(receiptRef)]);
   if(receiptSnap.exists){
    const r=receiptSnap.data();
    if(r.generation!==c.generation||r.operatorId!==actor.operatorId||r.fingerprint!==identity)
     error('IDEMPOTENCY_CONFLICT');
    return {...r.result,replayed:true};
   }
   const original=occSnap.data(),ev=evSnap.data();
   if(!original||original.generation!==c.generation||original.tenantId!==uid||
     !ev||ev.generation!==c.generation||ev.tenantId!==uid||
     ev.occurrenceId!==input.occurrenceId)error('EVIDENCE_NOT_FOUND');
   if(original.revision!==input.expectedRevision)error('REVISION_CONFLICT');
   if(ev.status!=='ACTIVE')error('EVIDENCE_ALREADY_INVALIDATED');
   const current=original.evidence?.find(e=>e.id===input.id);
   if(!current||current.status!=='ACTIVE')error('EVIDENCE_NOT_FOUND');
   const at=new Date(now()).toISOString(),eventId=hash(`occ-invalidate:${uid}:${input.key}`);
   const revision=original.revision+1;
   const updated={...original,revision,updatedAt:now(),updatedBy:actor.operatorId,
    evidence:original.evidence.map(e=>e.id===input.id?
      {...e,status:'INVALIDATED',invalidatedAt:at,invalidatedBy:actor.operatorId,reason:input.reason}:e),
    history:[...original.history,{eventId,domain:'evidence',from:'ACTIVE',to:'INVALIDATED',
      actorId:actor.operatorId,at,note:input.reason}]};
   const result={occurrenceId:input.occurrenceId,evidenceId:input.id,status:'INVALIDATED',revision};
   tx.set(occRef,updated);
   tx.update(evidenceRef,{status:'INVALIDATED',invalidatedBy:actor.operatorId,invalidatedAt:at,
    reason:input.reason});
   tx.create(receiptRef,{fingerprint:identity,operatorId:actor.operatorId,generation:c.generation,result});
   tx.create(rootDoc(c,'distribution_occurrence_events',eventId),{id:eventId,tenantId:uid,
    occurrenceId:input.occurrenceId,revision,type:'EVIDENCE_INVALIDATED',
    operatorId:actor.operatorId,serverAt:now(),payload:{evidenceId:input.id}});
   tx.create(rootDoc(c,'distribution_outbox',eventId),{schema:1,id:eventId,tenantId:uid,
    type:'distribution.occurrence.evidence-invalidated.v1',entityId:original.id,
    payload:{occurrenceId:original.id,evidenceId:input.id},state:'LOCAL_ONLY',occurredAt:at});
   tx.update(db.doc(c.base),{sequence:c.head.sequence+1,lastReceipt:eventId});
   return result;
  },{maxAttempts:15});
 }
 return {occurrenceEvidenceUpload,occurrenceEvidenceRead,occurrenceEvidenceInvalidate};
}
