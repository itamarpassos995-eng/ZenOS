// Server-only Google identity verification. Google login alone NEVER proves MFA.
import {createRemoteJWKSet, jwtVerify} from 'jose';
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const issuers = ['https://accounts.google.com', 'accounts.google.com'];
export function createGoogleIdentityVerifier({clientId, jwks = googleKeys} = {}) {
  if (typeof clientId !== 'string' || !clientId.trim()) throw Error('GOOGLE_CLIENT_ID_REQUIRED');
  return async function verifyGoogleIdentity(idToken, expectedNonce) {
    if (typeof idToken !== 'string' || idToken.length > 16384 ||
        typeof expectedNonce !== 'string' || expectedNonce.length < 32) return null;
    try {
      const {payload} = await jwtVerify(idToken, jwks, {
        issuer: issuers, audience: clientId, algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'iat', 'nonce', 'email', 'email_verified'],
        maxTokenAge: '10m', clockTolerance: 5,
      });
      if (payload.nonce !== expectedNonce || payload.email_verified !== true ||
          typeof payload.sub !== 'string' || !payload.sub ||
          typeof payload.email !== 'string' ||
          (payload.azp !== undefined && payload.azp !== clientId)) return null;
      return {subject: `google:${payload.sub}`, email: payload.email, issuerVerified: true};
    } catch { return null; }
  };
}
// Use only AFTER the server has validated the independent second factor.
// Roles and active status are ALWAYS loaded from PostgreSQL, never Google claims.
export function createAdminIdentityResolver({pool} = {}) {
  if (!pool || typeof pool.query !== 'function') throw Error('POOL_REQUIRED');
  return async function resolveAdmin(identity) {
    if (identity?.issuerVerified !== true || typeof identity.subject !== 'string') return null;
    const {rows} = await pool.query(`SELECT u.external_subject, u.active,
      COALESCE(array_agg(r.role) FILTER (WHERE r.role IS NOT NULL), ARRAY[]::text[]) AS roles
      FROM admin_users u LEFT JOIN admin_roles r ON r.admin_id = u.id
      WHERE u.external_subject = $1
      GROUP BY u.id, u.external_subject, u.active`, [identity.subject]);
    const admin = rows[0];
    if (!admin?.active || !admin.roles?.length) return null;
    return {subject: admin.external_subject, active: true, roles: admin.roles};
  };
}
