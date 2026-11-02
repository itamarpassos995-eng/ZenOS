import {randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {matchTotp} from './totp.mjs';
export const randomToken=()=>randomBytes(32).toString('base64url');
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function createSecretBox(encodedKey){
  const key=Buffer.from(encodedKey||'','base64');
  if(key.length!==32)throw Error('AUTH_KEY_REQUIRED');
  return {
    seal(value,context){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
      cipher.setAAD(Buffer.from(context));const data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
      return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');},
    open(value,context){const data=Buffer.from(value,'base64url');if(data.length<29)throw Error('INVALID_CIPHER');
      const cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));cipher.setAAD(Buffer.from(context));
      cipher.setAuthTag(data.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString());}
  };
}
function generateSecret(){
  let value=0,bits=0,result='';for(const byte of randomBytes(20)){
    value=(value<<8)|byte;bits+=8;while(bits>=5){bits-=5;result+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(value>>>bits)&31];}}
  return result;
}
export function createAuthStore({pool,box,bootstrapEmail,now=Date.now}){
  const date=()=>new Date(now());
  async function transaction(fn){const c=await pool.connect();try{await c.query('BEGIN');
    const result=await fn(c);await c.query('COMMIT');return result;
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}
  return {
    async saveAttempt({state,browser,payload}){
      await pool.query('INSERT INTO admin_oauth_attempts VALUES ($1,$2,$3,$4)',
        [hash(state),hash(browser),box.seal(payload,'oauth'),new Date(now()+300000)]);
    },
    async consumeAttempt(state,browser){
      const {rows}=await pool.query(`DELETE FROM admin_oauth_attempts WHERE state_hash=$1 AND browser_hash=$2
        AND expires_at>$3 RETURNING payload_cipher`,[hash(state),hash(browser),date()]);
      return rows[0]?box.open(rows[0].payload_cipher,'oauth'):null;
    },
    async authorizeGoogle(identity){
      if(identity?.issuerVerified!==true)return null;
      return transaction(async c=>{
        // Only an explicitly configured verified email may bootstrap the first owner.
        await c.query('SELECT pg_advisory_xact_lock(718264091)');
        let {rows}=await c.query('SELECT id,active FROM admin_users WHERE external_subject=$1',[identity.subject]);
        if(!rows.length && bootstrapEmail && identity.email.toLowerCase()===bootstrapEmail.toLowerCase()){
          const owners=await c.query("SELECT 1 FROM admin_roles WHERE role='owner' LIMIT 1");
          if(!owners.rows.length){
            ({rows}=await c.query('INSERT INTO admin_users(external_subject,email) VALUES($1,$2) RETURNING id,active',[identity.subject,identity.email]));
            await c.query("INSERT INTO admin_roles(admin_id,role) VALUES($1,'owner')",[rows[0].id]);
            await c.query("INSERT INTO audit_events(admin_id,action) VALUES($1,'admin.bootstrap')",[rows[0].id]);
          }
        }
        const admin=rows[0];if(!admin?.active)return null;
        const roles=await c.query('SELECT role FROM admin_roles WHERE admin_id=$1',[admin.id]);
        if(!roles.rows.length)return null;
        const secret=generateSecret();
        await c.query(`INSERT INTO admin_mfa_state(admin_id,secret_cipher) VALUES($1,$2)
          ON CONFLICT(admin_id) DO NOTHING`,[admin.id,box.seal(secret,admin.id)]);
        return admin.id;
      });
    },
    async createChallenge(adminId){
      const token=randomToken(),csrf=randomToken();
      await pool.query('INSERT INTO admin_auth_challenges VALUES($1,$2,$3,$4)',
        [hash(token),adminId,hash(csrf),new Date(now()+300000)]);
      return {token,csrf};
    },
    async challenge(token){
      const {rows}=await pool.query(`SELECT c.admin_id,m.enabled,m.secret_cipher,u.email
        FROM admin_auth_challenges c JOIN admin_mfa_state m ON m.admin_id=c.admin_id
        JOIN admin_users u ON u.id=c.admin_id WHERE c.token_hash=$1 AND c.expires_at>$2 AND u.active=true`,[hash(token),date()]);
      const row=rows[0];if(!row)return null;
      return {enabled:row.enabled,email:row.email,secret:row.enabled?undefined:box.open(row.secret_cipher,row.admin_id)};
    },
    async finishMfa({token,csrf,code}){
      return transaction(async c=>{
        const {rows}=await c.query(`SELECT a.admin_id,m.last_counter,m.failures,m.locked_until,m.secret_cipher
          FROM admin_auth_challenges a JOIN admin_mfa_state m ON m.admin_id=a.admin_id
          JOIN admin_users u ON u.id=a.admin_id
          WHERE a.token_hash=$1 AND a.csrf_hash=$2 AND a.expires_at>$3 AND u.active=true
          FOR UPDATE OF a,m`,[hash(token),hash(csrf),date()]);
        const m=rows[0];if(!m)return null;
        if(m.locked_until && new Date(m.locked_until)>date())return null;
        const counter=matchTotp({secret:box.open(m.secret_cipher,m.admin_id),code,now:now()});
        if(counter===null || counter<=Number(m.last_counter)){
          const failures=m.locked_until?1:m.failures+1;
          await c.query('UPDATE admin_mfa_state SET failures=$2,locked_until=$3 WHERE admin_id=$1',
            [m.admin_id,failures,failures>=5?new Date(now()+900000):null]);return null;
        }
        await c.query('UPDATE admin_mfa_state SET enabled=true,last_counter=$2,failures=0,locked_until=NULL WHERE admin_id=$1',[m.admin_id,counter]);
        // Invalidate every pending challenge for this admin after a successful MFA.
        await c.query('DELETE FROM admin_auth_challenges WHERE admin_id=$1',[m.admin_id]);
        const session=randomToken();
        await c.query('INSERT INTO admin_sessions(token_hash,admin_id,expires_at) VALUES($1,$2,$3)',[hash(session),m.admin_id,new Date(now()+3600000)]);
        await c.query("INSERT INTO audit_events(admin_id,action) VALUES($1,'admin.login.mfa')",[m.admin_id]);
        return session;
      });
    },
    async verifySession(token){
      const {rows}=await pool.query(`SELECT u.external_subject,u.active,
        COALESCE(array_agg(r.role) FILTER(WHERE r.role IS NOT NULL),ARRAY[]::text[]) AS roles
        FROM admin_sessions s JOIN admin_users u ON u.id=s.admin_id
        JOIN admin_mfa_state m ON m.admin_id=u.id LEFT JOIN admin_roles r ON r.admin_id=u.id
        WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.active=true AND m.enabled=true
        GROUP BY u.id`,[hash(token),date()]);
      const u=rows[0];return u?.roles.length?{subject:u.external_subject,active:true,roles:u.roles,issuerVerified:true,mfaVerified:true}:null;
    },
    async logout(token){await pool.query('DELETE FROM admin_sessions WHERE token_hash=$1',[hash(token)]);},
    async cleanup(){await pool.query('DELETE FROM admin_oauth_attempts WHERE expires_at<$1',[date()]);
      await pool.query('DELETE FROM admin_auth_challenges WHERE expires_at<$1',[date()]);
      await pool.query('DELETE FROM admin_sessions WHERE expires_at<$1',[date()]);}
  };
}
