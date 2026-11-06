import {fail,clone,transitionLoad,replaceLoadLines,issueManifest} from './domain.js';

export const COMMAND_PERMISSIONS = Object.freeze({REPLACE_LINES:'distribution.load.edit',TRANSITION_LOAD:'distribution.load.transition',ISSUE_MANIFEST:'distribution.manifest.issue'});
/** Server host contract. authorize MUST resolve live identity, tenant, operator and entitlement;
 * never pass request.data as principal. transaction MUST atomically persist load, receipt and outbox.
 * No Firebase endpoint is exported until server-side operator identity is certified.
 */
export async function executeLoadCommand({command,authorize,transaction}) {
 const {tenantId,loadId,key,expectedRevision,type,payload} = command;
 if (![tenantId,loadId,key].every(s=>typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(s))) fail('INVALID_COMMAND_ID');
 if (!Object.hasOwn(COMMAND_PERMISSIONS,type) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail('INVALID_COMMAND');
 const principal = await authorize({tenantId,permission:COMMAND_PERMISSIONS[type]});
 if (!principal || principal.tenantId !== tenantId || !principal.operatorId || principal.moduleEnabled !== true || !principal.permissions?.includes(COMMAND_PERMISSIONS[type])) fail('FORBIDDEN');
 // Exact canonical command is stored with receipt; key reuse with different content is rejected.
 const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
 const identity = JSON.stringify(canonical(command));
 return transaction({tenantId,loadId,key}, async ({load,receipt}) => {
  if (receipt) {
   if (receipt.identity !== identity || receipt.operatorId !== principal.operatorId) fail('IDEMPOTENCY_CONFLICT');
   return {replay:true,result:clone(receipt.result)};
  }
  if (!load || load.tenantId !== tenantId || load.id !== loadId) fail('LOAD_NOT_FOUND');
  if (load.revision !== expectedRevision) fail('REVISION_CONFLICT');
  let updated;
  if (type === 'REPLACE_LINES') updated = replaceLoadLines(load,payload.lines);
  if (type === 'TRANSITION_LOAD') {
   // Physical dispatch awaits the certified stock adapter; never fake an expedition.
   if (payload.next === 'DISPATCHED') fail('STOCK_ADAPTER_REQUIRED');
   updated = transitionLoad(load,payload.next);
  }
  if (type === 'ISSUE_MANIFEST') updated = issueManifest(load,payload);
  const result = {loadId,revision:updated.revision,state:updated.state};
  return {load:updated,receipt:{identity,operatorId:principal.operatorId,result},
   event:{schemaVersion:1,id:`${tenantId}:${loadId}:${key}`,tenantId,entityId:loadId,type:'distribution.load.changed.v1',revision:updated.revision,correlationId:key},result};
 });
}
