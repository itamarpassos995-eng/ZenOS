import {validateEvent} from './organization-events.mjs';
export function normalizeIncomingEvent(input,{verifiedSource,verifiedOrganizationUid}={}){
 // Trusted metadata must be supplied by a server-side authenticated transport.
 if(verifiedSource!=='zenos-backend'||typeof verifiedOrganizationUid!=='string')throw Error('UNVERIFIED_PRODUCER');
 if(input?.organizationUid!==verifiedOrganizationUid)throw Error('TENANT_MISMATCH');
 return validateEvent({...input,source:verifiedSource});
}
export function makeInboxInsert(event){
 const e=validateEvent(event);
 return {
  text:'INSERT INTO inbox_events (event_id,event_type,organization_uid,payload) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
  values:[e.eventId,e.eventType,e.organizationUid,JSON.stringify(e.payload)]
 };
}
