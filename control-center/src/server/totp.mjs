import {createHmac, timingSafeEqual} from 'node:crypto';
function decodeBase32(secret) {
  if (typeof secret !== 'string' || !/^[A-Z2-7]{32,128}$/.test(secret)) throw Error('INVALID_TOTP_SECRET');
  let bits=0, value=0; const bytes=[];
  for(const c of secret){value=(value<<5)|'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);bits+=5;
    if(bits>=8){bits-=8;bytes.push((value>>>bits)&255);}}
  return Buffer.from(bytes);
}
// Returns the matched counter, so the caller can atomically reject code reuse.
export function matchTotp({secret,code,now=Date.now()}={}) {
  if(typeof code!=='string'||!/^\d{6}$/.test(code)||!Number.isFinite(now)||now<0)return null;
  const key=decodeBase32(secret), counter=Math.floor(now/30000);
  for(const step of [counter,counter-1,counter+1]){
    if(step<0)continue;
    const input=Buffer.alloc(8);input.writeBigUInt64BE(BigInt(step));
    const mac=createHmac('sha1',key).update(input).digest(), offset=mac[19]&15;
    const expected=String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
    if(timingSafeEqual(Buffer.from(expected),Buffer.from(code)))return step;
  }
  return null;
}
// Secret is supplied by a server-side secret store; never pass it from a request.
// Failed attempts and successful counters persist across processes and restarts.
export function createTotpSecondFactor({pool,loadSecret,now=Date.now}={}) {
  if(!pool?.connect || typeof loadSecret!=='function')throw Error('MFA_NOT_CONFIGURED');
  return async function verifySecondFactor({subject,code}={}) {
    if(typeof subject!=='string'||!subject)return false;
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const {rows}=await client.query(`SELECT m.admin_id,m.last_counter,m.failures,m.locked_until
        FROM admin_mfa_state m JOIN admin_users u ON u.id=m.admin_id
        WHERE u.external_subject=$1 AND u.active=true FOR UPDATE OF m`,[subject]);
      const state=rows[0], time=now();
      if(!state || (state.locked_until && new Date(state.locked_until).getTime()>time)){
        await client.query('ROLLBACK');return false;
      }
      const secret=await loadSecret(subject);
      const counter=matchTotp({secret,code,now:time});
      if(counter===null || counter<=Number(state.last_counter)){
        await client.query(`UPDATE admin_mfa_state SET
          failures=CASE WHEN locked_until <= $2 THEN 1 ELSE failures+1 END,
          locked_until=CASE WHEN (CASE WHEN locked_until <= $2 THEN 1 ELSE failures+1 END)>=5
            THEN $2::timestamptz + interval '15 minutes' ELSE NULL END WHERE admin_id=$1`,
          [state.admin_id,new Date(time)]);
        await client.query('COMMIT');return false;
      }
      await client.query('UPDATE admin_mfa_state SET last_counter=$2,failures=0,locked_until=NULL WHERE admin_id=$1',[state.admin_id,counter]);
      await client.query('COMMIT');return true;
    } catch {await client.query('ROLLBACK').catch(()=>{});return false;}
    finally{client.release();}
  };
}
