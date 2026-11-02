// Adapter boundary: never accept identity claims directly from request headers.
// The actual identity provider MUST supply the verified function after MFA setup.
export function createSessionVerifier({verifyProviderToken}={}){
  if(typeof verifyProviderToken!=='function') throw new Error('AUTH_PROVIDER_NOT_CONFIGURED');
  return async function verifySession(headers){
    const cookie=headers?.cookie || headers?.Cookie || '';
    if(typeof cookie!=='string' || cookie.length>8192) return null;
    const match=cookie.match(/(?:^|;\s*)zenos_admin_session=([^;]+)/);
    if(!match)return null;
    const result=await verifyProviderToken(decodeURIComponent(match[1]));
    if(!result || result.issuerVerified!==true || result.mfaVerified!==true || !result.subject || !Array.isArray(result.roles)) return null;
    return {subject:result.subject,active:result.active===true,roles:result.roles,mfaVerified:true};
  };
}
