// Authorization policy only; caller must verify identity and MFA with an actual server-side provider.
export const ROLES=Object.freeze(['owner','billing','support','auditor']);
const allowed=Object.freeze({
  'organizations:read':['owner','billing','support','auditor'],
  'subscriptions:read':['owner','billing','support','auditor'],
  'subscriptions:write':['owner'],
  'invoices:read':['owner','billing','auditor'],
  'invoices:write':['owner','billing'],
  'payments:read':['owner','billing','auditor'],
  'payments:write':['owner','billing'],
  'requests:read':['owner','billing','support','auditor'],
  'requests:write':['owner','support'],
  'admins:manage':['owner'],
  'audit:read':['owner','auditor']
});
const privileged=new Set(['subscriptions:write','invoices:write','payments:write','requests:write','admins:manage']);
export function authorizeAdmin({subject,active,roles,mfaVerified},action){
  if(typeof subject!=='string'||!subject.trim()||active!==true||!Array.isArray(roles)) return false;
  if(!Object.prototype.hasOwnProperty.call(allowed,action)) return false;
  if(!roles.some(role=>ROLES.includes(role)&&allowed[action].includes(role))) return false;
  return !privileged.has(action)||mfaVerified===true;
}
export function assertAdminAccess(identity,action){
  if(!authorizeAdmin(identity,action)) throw new Error('ACCESS_DENIED');
  return true;
}
