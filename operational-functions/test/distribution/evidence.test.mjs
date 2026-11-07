import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db,seed,PIN} from './fixture.mjs';
import {distributionService} from '../../src/distribution/service.js';
import {decodePrivateEvidence,localPrivateEvidenceStore} from '../../src/distribution/privateEvidence.js';
const service=distributionService(db);
const SAMPLE_PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/LysAAAAASUVORK5CYII=';
const identity=async()=>{const f=await seed('distribution-evidence-'+randomUUID().slice(0,9),{orders:1});
 await db.doc(`${f.root}/distribution_config/module`).update({fiscalCountry:'PY'});
 const session=await service.login(f.uid,{operatorId:'admin',pin:PIN});
 const occId='OCC-'+randomUUID(),cmd={type:'CREATE',occurrenceId:occId,expectedRevision:0,key:randomUUID(),
  payload:{id:occId,refs:{saleId:'O001',orderId:'O001',customerId:'C1',orderLineId:'0',productId:'P1'},
   reason:'DAMAGED',quantity:1,description:'Foto de avaria sintética'}};
 await service.occurrenceCommand(f.uid,session.sessionToken,cmd);
 return {...f,token:session.sessionToken,occId};
};
test('private evidence attaches and reads exact bytes only with authenticated tenant and operator',async()=>{
 const f=await identity();
 const command={occurrenceId:f.occId,id:'EV-'+randomUUID(),key:randomUUID(),expectedRevision:0,
  kind:'PHOTO',mediaType:'image/png',base64:SAMPLE_PNG};
 const result=await service.occurrenceEvidenceUpload(f.uid,f.token,command);
 assert.equal(result.revision,1);assert.equal(result.status,'ACTIVE');
 const again=await service.occurrenceEvidenceUpload(f.uid,f.token,command);
 assert.equal(again.replayed,true);
 const read=await service.occurrenceEvidenceRead(f.uid,f.token,{occurrenceId:f.occId,id:command.id});
 assert.equal(read.base64,SAMPLE_PNG);
 assert.equal(read.mediaType,'image/png');
 const o=(await db.doc(`${f.root}/distribution_occurrences/${f.occId}`).get()).data();
 assert.equal(o.evidence[0].status,'ACTIVE');
 assert.equal(o.evidence[0].uploadedBy,'admin');
 assert.equal(o.evidence[0].base64,undefined);
 assert.equal((await db.collection(`${f.root}/distribution_evidence`).get()).size,1);
 assert.equal((await db.collection(`${f.root}/financeiro_livro`).get()).size,0);
 assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,100);
 await assert.rejects(service.occurrenceEvidenceRead(f.uid,'invalid',{occurrenceId:f.occId,id:command.id}));
 await assert.rejects(service.occurrenceEvidenceUpload(f.uid,f.token,{...command,expectedRevision:1,key:randomUUID(),base64:SAMPLE_PNG}),{code:'EVIDENCE_ID_COLLISION'});
});
test('private evidence rejects MIME spoofing, oversized files and invalid format',async()=>{
 assert.throws(()=>decodePrivateEvidence(Buffer.from('This is not an image').toString('base64'),'image/png'),{code:'EVIDENCE_MAGIC_INVALID'});
 assert.throws(()=>decodePrivateEvidence(Buffer.from('This is not a document').toString('base64'),'application/pdf'),{code:'EVIDENCE_MAGIC_INVALID'});
 assert.throws(()=>decodePrivateEvidence(Buffer.alloc(1_000_001,65).toString('base64'),'image/jpeg'),{code:'EVIDENCE_FILE_INVALID'});
 assert.throws(()=>decodePrivateEvidence('not_base64!','image/png'),{code:'EVIDENCE_FILE_INVALID'});
});
test('private evidence cannot be read by another company even with same evidence ID',async()=>{
 const a=await identity(),b=await identity(),id='EV-'+randomUUID();
 await service.occurrenceEvidenceUpload(a.uid,a.token,{occurrenceId:a.occId,id,key:randomUUID(),
  expectedRevision:0,kind:'PHOTO',mediaType:'image/png',base64:SAMPLE_PNG});
 await assert.rejects(service.occurrenceEvidenceRead(b.uid,b.token,{occurrenceId:a.occId,id}),{code:'EVIDENCE_NOT_FOUND'});
});
test('private storage files are not stored under Firestore and require exact tenant/occurrence hash',async()=>{
 const f=await identity(),storage=localPrivateEvidenceStore(),id='EV-'+randomUUID();
 const bytes=decodePrivateEvidence(SAMPLE_PNG,'image/png');
 const staged=await storage.stage({tenantId:f.uid,occurrenceId:f.occId,evidenceId:id,bytes,mediaType:'image/png'});
 assert.equal((await storage.read({tenantId:f.uid,occurrenceId:f.occId,evidenceId:id,sha256:staged.sha256})).length,bytes.length);
 await assert.rejects(storage.read({tenantId:'another-company',occurrenceId:f.occId,evidenceId:id,sha256:staged.sha256}));
 await storage.discard({tenantId:f.uid,occurrenceId:f.occId,evidenceId:id});
});

test('A3 evidence invalidation remains in historical record but is denied to readers',async()=>{
 const f=await identity(),id='EV-'+randomUUID();
 const upload=await service.occurrenceEvidenceUpload(f.uid,f.token,{occurrenceId:f.occId,id,
  expectedRevision:0,key:randomUUID(),kind:'DOCUMENT',mediaType:'image/png',base64:SAMPLE_PNG});
 const request={occurrenceId:f.occId,id,expectedRevision:upload.revision,
  key:randomUUID(),reason:'Anexo equivocado na conferência sintética'};
 const invalidated=await service.occurrenceEvidenceInvalidate(f.uid,f.token,request);
 assert.equal(invalidated.status,'INVALIDATED');
 assert.equal((await service.occurrenceEvidenceInvalidate(f.uid,f.token,request)).replayed,true);
 await assert.rejects(service.occurrenceEvidenceRead(f.uid,f.token,{occurrenceId:f.occId,id}),{code:'EVIDENCE_NOT_FOUND'});
 const o=(await db.doc(`${f.root}/distribution_occurrences/${f.occId}`).get()).data();
 assert.equal(o.evidence[0].status,'INVALIDATED');
 assert.equal(o.evidence[0].invalidatedBy,'admin');
 assert.equal(o.history.at(-1).to,'INVALIDATED');
 assert.equal((await db.collection(`${f.root}/distribution_occurrence_events`).get()).size,3);
});
