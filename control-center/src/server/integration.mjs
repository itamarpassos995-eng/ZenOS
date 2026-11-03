import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
import {processCommercialEvent} from './event-processor.mjs';
export function signature(secret,timestamp,body){return createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex');}
export function verifySignature(secret,timestamp,body,provided,now=Date.now()){
 if(typeof secret!=='string'||secret.length<32||!/^\d{13}$/.test(timestamp||'')||Math.abs(now-Number(timestamp))>300000||! /^[a-f0-9]{64}$/.test(provided||''))return false;
 return timingSafeEqual(Buffer.from(signature(secret,timestamp,body)),Buffer.from(provided));
}
export function createIntegration({pool,secret,origin,enabled=false,fetchImpl=fetch}){
 const configured=typeof secret==='string'&&secret.length>=32;
 const target=origin?new URL(origin):null;
 if(target&&(target.protocol!=='https:'||target.username||target.password||target.pathname!=='/'))throw Error('INVALID_INTEGRATION_ORIGIN');
 async function incoming({body,headers}){
  if(!enabled||!configured)return {status:503,body:{error:'INTEGRATION_DISABLED'}};
  if(!verifySignature(secret,headers['x-zenos-timestamp'],body,headers['x-zenos-signature']))return {status:401,body:{error:'INVALID_SIGNATURE'}};
  const input=JSON.parse(body);
  const result=await processCommercialEvent({pool,input,verifiedSource:'zenos-backend',verifiedOrganizationUid:input.organizationUid});return {status:200,body:result};
 }
 async function dispatch(){
  if(!enabled||!configured||!target)return {disabled:true};
  const c=await pool.connect();let cmd;
  try{
   await c.query('BEGIN');
   cmd=(await c.query(`SELECT c.*,o.firebase_uid FROM administrative_commands c JOIN organizations o ON o.id=c.organization_id JOIN outbox_events e ON e.id=c.outbox_id WHERE c.state IN ('pending','failed','processing') AND e.delivered_at IS NULL AND e.next_attempt_at<=now() AND c.attempts<8 ORDER BY c.created_at FOR UPDATE OF c SKIP LOCKED LIMIT 1`)).rows[0];
   if(!cmd){await c.query('COMMIT');return {empty:true};}
   await c.query("UPDATE administrative_commands SET state='processing',attempts=attempts+1 WHERE id=$1",[cmd.id]);
   await c.query("UPDATE outbox_events SET attempts=attempts+1,next_attempt_at=now()+interval '2 minutes' WHERE id=$1",[cmd.outbox_id]);await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  try{
   const body=JSON.stringify({commandId:cmd.id,organizationUid:cmd.firebase_uid,revision:cmd.expected_revision,type:cmd.command_type,payload:cmd.payload});
   const timestamp=String(Date.now());
   const r=await fetchImpl(new URL('/internal/control-center/commands',target),{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json','x-zenos-timestamp':timestamp,'x-zenos-signature':signature(secret,timestamp,body)},body});
   const raw=await r.text();if(raw.length>16384||!r.ok||!verifySignature(secret,r.headers.get('x-zenos-timestamp'),raw,r.headers.get('x-zenos-signature')))throw Error('INVALID_ACK');
   const ack=JSON.parse(raw);
   if(ack.commandId!==cmd.id||ack.organizationUid!==cmd.firebase_uid||ack.revision!==cmd.expected_revision||ack.state!=='applied'||ack.requestHash!==createHash('sha256').update(body).digest('hex'))throw Error('INVALID_ACK');
   const db=await pool.connect();try{
    await db.query('BEGIN');
    const current=(await db.query('SELECT state FROM administrative_commands WHERE id=$1 FOR UPDATE',[cmd.id])).rows[0];
    if(current.state!=='applied'){
     const confirmedUpdate=async(sql,args)=>{const result=await db.query(sql,args);if(result.rowCount!==1)throw Error('SUBSCRIPTION_REVISION_CONFLICT');};
     if(cmd.command_type==='subscription.bonus')await confirmedUpdate("UPDATE subscriptions SET ends_at=$3,revision=revision+1 WHERE id=$1 AND organization_id=$2 AND revision=$4",[cmd.payload.subscriptionId,cmd.organization_id,cmd.payload.endsAt,cmd.payload.expectedSubscriptionRevision]);
     if(cmd.command_type==='subscription.plan_changed')await confirmedUpdate('UPDATE subscriptions SET plan_id=$3,currency=$4,recurring_amount=$5,revision=revision+1 WHERE id=$1 AND organization_id=$2 AND revision=$6',[cmd.payload.subscriptionId,cmd.organization_id,cmd.payload.planId,cmd.payload.currency,cmd.payload.amount,cmd.payload.expectedSubscriptionRevision]);
     if(cmd.command_type==='subscription.canceled')await confirmedUpdate("UPDATE subscriptions SET status='canceled',ends_at=GREATEST(starts_at+interval '1 second',now()),revision=revision+1 WHERE id=$1 AND organization_id=$2 AND revision=$3",[cmd.payload.subscriptionId,cmd.organization_id,cmd.payload.expectedSubscriptionRevision]);
     if(cmd.command_type==='module.grant')await db.query('INSERT INTO entitlements(organization_id,module_id,valid_from,valid_until) VALUES($1,$2,now(),$3)',[cmd.organization_id,cmd.payload.moduleId,cmd.payload.validUntil]);
     await db.query("UPDATE organization_access SET applied_state=CASE WHEN $3='access.suspend' THEN 'suspended' WHEN $3='access.restore' THEN 'allowed' ELSE applied_state END,applied_revision=$2 WHERE organization_id=$1 AND revision=$2",[cmd.organization_id,cmd.expected_revision,cmd.command_type]);
     await db.query("UPDATE administrative_commands SET state='applied',applied_at=now(),last_error=NULL WHERE id=$1",[cmd.id]);
     await db.query('UPDATE outbox_events SET delivered_at=now() WHERE id=$1',[cmd.outbox_id]);
     await db.query("INSERT INTO audit_events(admin_id,organization_id,action,after_state) VALUES($1,$2,'command.applied',$3::jsonb)",[cmd.actor_id,cmd.organization_id,JSON.stringify(ack)]);
    }
    await db.query('COMMIT');return {applied:true};
   }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }catch{
   await pool.query("UPDATE administrative_commands SET state='failed',last_error='Entrega não confirmada; retentativa automática' WHERE id=$1 AND state<>'applied'",[cmd.id]);
   await pool.query("UPDATE outbox_events SET next_attempt_at=now()+LEAST(3600,30*power(2,LEAST(attempts,7)))::integer*interval '1 second' WHERE id=$1 AND delivered_at IS NULL",[cmd.outbox_id]);return {failed:true};
  }
 }
 return {incoming,dispatch,enabled:Boolean(enabled&&configured&&target)};
}
