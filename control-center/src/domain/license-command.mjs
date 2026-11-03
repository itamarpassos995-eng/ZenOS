// Pure domain contract. No database, Firebase, UI or production side effects.
// "requested" is never represented as "applied" until the ZenOS adapter acknowledges it.
export const ACCESS_STATES=Object.freeze(['allowed','restricted','suspended']);
export const COMMERCIAL_STATES=Object.freeze(['trial','active','grace','past_due','suspended','canceled']);
export const DELIVERY_STATES=Object.freeze(['pending','processing','applied','failed']);
export const COMMAND_TYPES=Object.freeze(['access.suspend','access.restore','subscription.bonus']);
export function validateOrganizationUid(uid){
 if(typeof uid!=='string'||!uid.trim()||uid.length>256||uid.includes('/'))throw Error('INVALID_ORGANIZATION_UID');
 return uid;
}
export function validateCommand(input){
 if(!input||typeof input!=='object')throw Error('INVALID_COMMAND');
 const organizationUid=validateOrganizationUid(input.organizationUid);
 const type=input.type;
 if(!COMMAND_TYPES.includes(type))throw Error('INVALID_COMMAND_TYPE');
 if(typeof input.idempotencyKey!=='string'||!/^[A-Za-z0-9._:-]{16,128}$/.test(input.idempotencyKey))throw Error('INVALID_IDEMPOTENCY_KEY');
 if(typeof input.actor!=='string'||!input.actor.trim())throw Error('ACTOR_REQUIRED');
 if(typeof input.reason!=='string'||input.reason.trim().length<5||input.reason.length>500)throw Error('REASON_REQUIRED');
 if(type==='subscription.bonus'&&(!Number.isSafeInteger(input.days)||input.days<1||input.days>365))throw Error('INVALID_BONUS_DAYS');
 return Object.freeze({organizationUid,type,idempotencyKey:input.idempotencyKey,actor:input.actor,reason:input.reason.trim(),...(type==='subscription.bonus'?{days:input.days}:{})});
}
export function nextDeliveryState(current,event){
 if(!DELIVERY_STATES.includes(current))throw Error('INVALID_DELIVERY_STATE');
 const transitions={
  pending:{start:'processing'},
  processing:{ack:'applied',fail:'failed'},
  failed:{retry:'pending'},
  applied:{}
 };
 const next=transitions[current][event];
 if(!next)throw Error('INVALID_DELIVERY_TRANSITION');
 return next;
}
export function resolveAccess({commercialStatus,administrativeSuspended,entitlementValid,graceAllowed=false}){
 if(!COMMERCIAL_STATES.includes(commercialStatus))throw Error('INVALID_COMMERCIAL_STATE');
 if(typeof administrativeSuspended!=='boolean'||typeof entitlementValid!=='boolean')throw Error('INVALID_ACCESS_INPUT');
 if(administrativeSuspended||commercialStatus==='suspended'||commercialStatus==='canceled')return 'suspended';
 if(!entitlementValid)return 'restricted';
 if(commercialStatus==='active'||commercialStatus==='trial')return 'allowed';
 if(commercialStatus==='grace'&&graceAllowed)return 'allowed';
 return 'restricted';
}
