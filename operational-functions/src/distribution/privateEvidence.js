/** Phase 3.1 A.3 isolated PRIVATE evidence store for the local Firebase emulator.
 * This is never deployed: requireEmulators() and environment-specific OS temp dir.
 * No commerce token, no public URL, no Firestore binary data.
 * Production MUST use a separately provisioned private object store and credentials.
 */
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {requireEmulators,error} from './security.js';
const MAX_BYTES=1_000_000;
const sha=v=>createHash('sha256').update(v).digest('hex');
const root=join(tmpdir(),'zenos-distribution-private-emulator');
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9._:-]{1,120}$/.test(v);
const types=Object.freeze({'image/png':'png','image/jpeg':'jpg','application/pdf':'pdf'});
function verify(bytes,mediaType) {
 if(!Buffer.isBuffer(bytes)||bytes.length<12||bytes.length>MAX_BYTES||!Object.hasOwn(types,mediaType))
  error('EVIDENCE_FILE_INVALID');
 if(mediaType==='image/png'){
  if(!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))||
    bytes.toString('ascii',12,16)!=='IHDR')error('EVIDENCE_MAGIC_INVALID');
  const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
  if(w<1||h<1||w>4096||h>4096)error('EVIDENCE_DIMENSIONS_INVALID');
 }else if(mediaType==='image/jpeg'){
  if(bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)
    error('EVIDENCE_MAGIC_INVALID');
 }else if(mediaType==='application/pdf'){
  if(bytes.toString('ascii',0,5)!=='%PDF-'||
    !bytes.subarray(Math.max(0,bytes.length-1024)).toString('latin1').includes('%%EOF'))
    error('EVIDENCE_MAGIC_INVALID');
 }
}
export function decodePrivateEvidence(base64,mediaType) {
 if(typeof base64!=='string'||base64.length>Math.ceil(MAX_BYTES*4/3)+8||
   !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))error('EVIDENCE_FILE_INVALID');
 const bytes=Buffer.from(base64,'base64');
 if(bytes.toString('base64')!==base64)error('EVIDENCE_FILE_INVALID');
 verify(bytes,mediaType);return bytes;
}
export function privateEvidenceFileName(tenantId,occurrenceId,evidenceId) {
 if(![tenantId,occurrenceId,evidenceId].every(validId))error('INVALID_EVIDENCE_ID');
 return sha(JSON.stringify([tenantId,occurrenceId,evidenceId]));
}
export function localPrivateEvidenceStore() {
 requireEmulators();
 return Object.freeze({
  async stage({tenantId,occurrenceId,evidenceId,bytes,mediaType}) {
   verify(bytes,mediaType);
   const key=privateEvidenceFileName(tenantId,occurrenceId,evidenceId);
   await mkdir(root,{recursive:true,mode:0o700});
   const path=join(root,key);const digest=sha(bytes);let created=false;
   try{await writeFile(path,bytes,{flag:'wx',mode:0o600});created=true;}
   catch(e){
    if(e.code!=='EEXIST')throw e;
    if(sha(await readFile(path))!==digest)error('EVIDENCE_ID_COLLISION');
   }
   return {key,sha256:digest,bytes:bytes.length,mediaType,created};
  },
  async read({tenantId,occurrenceId,evidenceId,sha256}) {
   const key=privateEvidenceFileName(tenantId,occurrenceId,evidenceId);
   const bytes=await readFile(join(root,key));
   if(sha(bytes)!==sha256)error('EVIDENCE_INTEGRITY_FAILED');
   return bytes;
  },
  async discard({tenantId,occurrenceId,evidenceId}) {
   const key=privateEvidenceFileName(tenantId,occurrenceId,evidenceId);
   try{await unlink(join(root,key));}catch(e){if(e.code!=='ENOENT')throw e;}
  }
 });
}
