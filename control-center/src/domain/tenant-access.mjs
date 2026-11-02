// Tenant binding policy: never authorize by email or a client-supplied organization id alone.
export function assertTenantAccess({authenticatedUid,organizationUid,adminIdentity=null,action='organizations:read'}){
  if(typeof authenticatedUid!=='string'||!authenticatedUid.trim()) throw new Error('UNAUTHENTICATED');
  if(typeof organizationUid!=='string'||!organizationUid.trim()) throw new Error('INVALID_TENANT');
  // Administrator authorization must be checked by the server using the admin access policy.
  if(adminIdentity?.validatedByServer===true&&adminIdentity?.mayAccessTenant===true) return organizationUid;
  if(authenticatedUid!==organizationUid) throw new Error('TENANT_ACCESS_DENIED');
  if(action!=='organizations:read'&&action!=='requests:create') throw new Error('ACTION_NOT_ALLOWED');
  return organizationUid;
}
