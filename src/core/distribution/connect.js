/** Public Connect envelopes are prepared but never emitted to another tenant. */
export const CONNECT_EVENT_TYPES=Object.freeze(['connect.catalog.published.v1','connect.order.submitted.v1','connect.order.accepted.v1','connect.order.rejected.v1','connect.order.status_changed.v1','connect.shipment.dispatched.v1','connect.delivery.confirmed.v1','connect.order.cancel_requested.v1']);
export function validateConnectEnvelope(event) {
 if(!event||!CONNECT_EVENT_TYPES.includes(event.type)||event.version!==1||!['id','senderOrganizationId','recipientOrganizationId','entityId','externalId','occurredAt','idempotencyKey','correlationId'].every(k=>typeof event[k]==='string'&&event[k].length>0&&event[k].length<=200)||!Number.isFinite(Date.parse(event.occurredAt))||event.senderOrganizationId===event.recipientOrganizationId)throw Object.assign(new Error('INVALID_CONNECT_ENVELOPE'),{code:'INVALID_CONNECT_ENVELOPE'});
 if(!event.payload||typeof event.payload!=='object'||Array.isArray(event.payload)||JSON.stringify(event.payload).length>32000)throw new Error('INVALID_CONNECT_PAYLOAD');
 return structuredClone(event);
}

// Versioned logistics integration contracts remain local-only in Phase 3.
export const DISTRIBUTION_LOCAL_EVENT_VERSION=1;
export const DISTRIBUTION_TRIP_EVENTS=Object.freeze(['distribution.trip.deliver.v1','distribution.trip.arrive.v1','distribution.trip.check_return.v1','distribution.trip.close.v1']);
