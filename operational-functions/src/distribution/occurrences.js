/** Phase 3.1 occurrence command host contract.
 * The server host must authenticate operator/tenant live and atomically commit
 * occurrence + idempotency receipt + outbox event in Firestore V2.
 * Not yet mounted on a remote endpoint; no finance, stock or fiscal issuance.
 */
import {
 createDistributionOccurrence,transitionOccurrence,createFiscalAdjustmentDraft
} from '../../../src/core/distribution/phase31Foundation.js';

const fail=code=>{throw Object.assign(new Error(code),{code});};
const ident=v=>typeof v==='string' && /^[a-zA-Z0-9._:-]{1,120}$/.test(v);
const PERMISSIONS=Object.freeze({
 CREATE:'distribution.occurrence.create',
 TRANSITION_LOGISTICS:'distribution.occurrence.review',
 TRANSITION_FISCAL:'distribution.fiscal.review',
 TRANSITION_FINANCIAL:'distribution.finance.review',
 DRAFT_FISCAL:'distribution.fiscal.draft'
});
const canonical=value=>Array.isArray(value)?value.map(canonical):
 value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;

export async function executeOccurrenceCommand({command,authorize,transaction}) {
 const {tenantId,occurrenceId,key,type,payload,expectedRevision}=command||{};
 if(![tenantId,occurrenceId,key].every(ident)||!Object.hasOwn(PERMISSIONS,type)||
   !Number.isSafeInteger(expectedRevision)||expectedRevision<0)fail('INVALID_COMMAND');
 if(typeof transaction!=='function')fail('SERVER_HOST_REQUIRED');
 const identity=JSON.stringify(canonical(command));
 return transaction({tenantId,occurrenceId,key,permission:PERMISSIONS[type],type,payload},async ({occurrence,receipt,actor,validatedPayload})=>{
  if(!actor||actor.tenantId!==tenantId||!ident(actor.operatorId)||
    actor.moduleEnabled!==true||!actor.permissions?.includes(PERMISSIONS[type]))fail('FORBIDDEN');
  if(receipt) {
   if(receipt.identity!==identity||receipt.operatorId!==actor.operatorId)fail('IDEMPOTENCY_CONFLICT');
   return {replay:true,result:structuredClone(receipt.result)};
  }
  let updated;
  if(type==='CREATE') {
   if(occurrence)fail('OCCURRENCE_ALREADY_EXISTS');
   if(expectedRevision!==0||!validatedPayload||validatedPayload.id!==occurrenceId||
      validatedPayload.tenantId!==tenantId||validatedPayload.reportedBy!==actor.operatorId)fail('OCCURRENCE_CONTEXT_MISMATCH');
   updated=createDistributionOccurrence(validatedPayload);
  }else{
   if(!occurrence||occurrence.tenantId!==tenantId||occurrence.id!==occurrenceId)fail('OCCURRENCE_NOT_FOUND');
   if(occurrence.revision!==expectedRevision)fail('REVISION_CONFLICT');
   if(type==='DRAFT_FISCAL'){
    if(!validatedPayload)fail('FISCAL_SOURCE_NOT_VERIFIED');
    updated=createFiscalAdjustmentDraft(occurrence,{
     ...validatedPayload,actorId:actor.operatorId,expectedRevision
    });
   }else{
    if(!validatedPayload)fail('SERVER_VALIDATION_REQUIRED');
    const domain={TRANSITION_LOGISTICS:'logistics',TRANSITION_FISCAL:'fiscal',TRANSITION_FINANCIAL:'financial'}[type];
    updated=transitionOccurrence(occurrence,{
     ...validatedPayload,domain,actorId:actor.operatorId,expectedRevision
    });
   }
  }
  const result={occurrenceId,revision:updated.revision,states:updated.states,
   fiscalDraftCount:updated.fiscalDocuments.length};
  return {occurrence:updated,receipt:{identity,operatorId:actor.operatorId,result},
   outbox:{schema:1,type:'distribution.occurrence.changed.v1',version:1,tenantId,
    occurrenceId,revision:updated.revision,correlationId:key,state:'LOCAL_ONLY'},
   result};
 });
}
