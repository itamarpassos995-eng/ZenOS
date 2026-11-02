// Pure domain logic only. No Firebase, network, or production side effects.
const EVENT_TYPES = new Set(['organization.registered.v1', 'trial.started.v1', 'commercial.requested.v1']);
const uidPattern = /^[A-Za-z0-9_-]{6,128}$/;
export function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('INVALID_EVENT');
  if (typeof event.eventId !== 'string' || event.eventId.length < 8 || event.eventId.length > 128) throw new Error('INVALID_EVENT_ID');
  if (!EVENT_TYPES.has(event.eventType) || event.version !== 1) throw new Error('UNSUPPORTED_EVENT');
  if (typeof event.organizationUid !== 'string' || !uidPattern.test(event.organizationUid)) throw new Error('INVALID_TENANT');
  if (Number.isNaN(Date.parse(event.occurredAt)) || typeof event.occurredAt !== 'string') throw new Error('INVALID_DATE');
  if (event.source !== 'zenos-backend') throw new Error('UNTRUSTED_EVENT_SOURCE');
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) throw new Error('INVALID_PAYLOAD');
  if (JSON.stringify(event).length > 16384) throw new Error('EVENT_TOO_LARGE');
  if (event.eventType === 'organization.registered.v1') {
    if (typeof event.payload.displayName !== 'string' || !event.payload.displayName.trim() || event.payload.displayName.length > 180) throw new Error('INVALID_ORG_NAME');
  }
  if (event.eventType === 'commercial.requested.v1' && typeof event.payload.requestType !== 'string') throw new Error('INVALID_REQUEST_TYPE');
  return Object.freeze({...event, payload: Object.freeze({...event.payload})});
}
export function applyEventToMockState(state, event) {
  const e = validateEvent(event);
  if (state.processed.has(e.eventId)) return {state, duplicate: true};
  const next = {processed: new Set(state.processed), organizations: new Map(state.organizations), requests: [...state.requests]};
  if (e.eventType === 'organization.registered.v1') {
    const previous = next.organizations.get(e.organizationUid);
    next.organizations.set(e.organizationUid, {...previous, uid: e.organizationUid, name: e.payload.displayName, status: previous?.status ?? 'new'});
  }
  if (e.eventType === 'trial.started.v1') {
    const previous = next.organizations.get(e.organizationUid);
    if (!previous) throw new Error('UNKNOWN_ORGANIZATION');
    next.organizations.set(e.organizationUid, {...previous, status: 'trial'});
  }
  if (e.eventType === 'commercial.requested.v1') {
    if (!next.organizations.has(e.organizationUid)) throw new Error('UNKNOWN_ORGANIZATION');
    next.requests.push({eventId:e.eventId,uid:e.organizationUid,type:e.payload.requestType,status:'pending'});
  }
  next.processed.add(e.eventId);
  return {state:next, duplicate:false};
}
export function blankMockState(){return {processed:new Set(),organizations:new Map(),requests:[]};}
