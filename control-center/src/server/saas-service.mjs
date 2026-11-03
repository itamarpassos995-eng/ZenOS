import {createHash} from 'node:crypto';
import {money,decimal,currency} from '../domain/money.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const uuid=x=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x||''))throw Error('INVALID_ID');return x;};
const text=(x,max=180)=>{if(typeof x!=='string'||!x.trim()||x.length>max)throw Error('INVALID_TEXT');return x.trim();};
const integer=(x,min,max)=>{const n=Number(x);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('INVALID_INTEGER');return n;};
const date=x=>{if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x)||!Number.isFinite(Date.parse(x)))throw Error('INVALID_DATE');return x;};
const readRoles=['owner','billing','support','auditor'];
export const allowed={note:['owner','support'],suspend:['owner'],restore:['owner'],bonus:['owner','billing'],subscribe:['owner'],change_plan:['owner'],cancel_subscription:['owner'],plan:['owner'],module:['owner'],grant:['owner'],invoice:['owner','billing'],payment:['owner','billing'],discount:['owner','billing'],void:['owner','billing'],request:['owner','support']};
export function createSaasService(pool){
 async function transaction(fn){const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async function actor(c,session,action){
  if(session?.mfaVerified!==true)throw Error('MFA_REQUIRED');
  const {rows}=await c.query(`SELECT u.id,array_agg(r.role) roles FROM admin_users u JOIN admin_roles r ON r.admin_id=u.id WHERE u.external_subject=$1 AND u.active=true GROUP BY u.id`,[session.subject]);
  const a=rows[0];if(!a||!a.roles.some(r=>(action?allowed[action]||[]:readRoles).includes(r)))throw Error('FORBIDDEN');return a;
 }
 async function audit(c,a,org,action,before,after){await c.query('INSERT INTO audit_events(admin_id,organization_id,action,before_state,after_state) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',[a.id,org,action,JSON.stringify(before),JSON.stringify(after)]);}
 async function command(c,a,o,type,payload,reason,key,requestHash){
  await c.query('INSERT INTO organization_access(organization_id) VALUES($1) ON CONFLICT DO NOTHING',[o.id]);
  const state=(await c.query('SELECT * FROM organization_access WHERE organization_id=$1 FOR UPDATE',[o.id])).rows[0];
  if((await c.query("SELECT id FROM administrative_commands WHERE organization_id=$1 AND state IN ('pending','processing') LIMIT 1",[o.id])).rows.length)throw Error('COMMAND_ALREADY_PENDING');
  const revision=state.revision+1;
  const cmd=(await c.query(`INSERT INTO administrative_commands(organization_id,actor_id,idempotency_key,request_hash,command_type,reason,expected_revision,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id`,[o.id,a.id,key,requestHash,type,reason,revision,JSON.stringify(payload)])).rows[0];
  const out=(await c.query('INSERT INTO outbox_events(event_type,aggregate_id,payload) VALUES($1,$2,$3::jsonb) RETURNING id',[type,o.firebase_uid,JSON.stringify({commandId:cmd.id,organizationUid:o.firebase_uid,revision,type,payload,reason})])).rows[0];
  await c.query('UPDATE administrative_commands SET outbox_id=$2 WHERE id=$1',[cmd.id,out.id]);
  await c.query('UPDATE organization_access SET revision=$2,last_command_id=$3,desired_state=$4 WHERE organization_id=$1',[o.id,revision,cmd.id,type==='access.suspend'?'suspended':type==='access.restore'?'allowed':state.desired_state]);
  await audit(c,a,o.id,'command.requested',state,{commandId:cmd.id,type,revision,state:'pending'});
  return {id:cmd.id,state:'pending'};
 }
 async function mutate(session,input){
  const action=input.action;if(!allowed[action])throw Error('INVALID_ACTION');
  const key=text(input.key,128);if(!/^[A-Za-z0-9._:-]{16,128}$/.test(key))throw Error('INVALID_IDEMPOTENCY_KEY');
  const requestHash=hash(input);
  return transaction(async c=>{
   const a=await actor(c,session,action);
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key]);
   const prior=(await c.query('SELECT * FROM administrative_receipts WHERE idempotency_key=$1',[key])).rows[0];
   if(prior){if(prior.request_hash!==requestHash||prior.actor_id!==a.id)throw Error('IDEMPOTENCY_CONFLICT');return prior.result;}
   let org=null,o=null,result={state:'saved'};
   if(['note','suspend','restore','bonus','subscribe','change_plan','cancel_subscription','grant','invoice'].includes(action)){
    org=uuid(input.id);o=(await c.query('SELECT * FROM organizations WHERE id=$1 FOR UPDATE',[org])).rows[0];if(!o)throw Error('ORGANIZATION_NOT_FOUND');
   }
   const reason=text(input.reason,500);if(reason.length<5)throw Error('REASON_REQUIRED');
   if(['suspend','restore','bonus','grant'].includes(action)){
    if(['suspend','restore'].includes(action)&&input.confirm!==o.firebase_uid)throw Error('CONFIRM_ORGANIZATION_REQUIRED');
    const payload=action==='bonus'?{days:integer(input.days,1,365)}:action==='grant'?{moduleId:uuid(input.module_id),validUntil:date(input.ends_at)}:{};
    if(action==='bonus'){
     const s=(await c.query("SELECT id,ends_at,revision FROM subscriptions WHERE organization_id=$1 AND status<>'canceled' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[org])).rows[0];if(!s)throw Error('SUBSCRIPTION_REQUIRED');
     payload.subscriptionId=s.id;payload.expectedSubscriptionRevision=s.revision;payload.endsAt=new Date(Math.max(Date.now(),s.ends_at?new Date(s.ends_at).getTime():0)+payload.days*86400000).toISOString();
    }
    if(action==='grant'&&!(await c.query('SELECT id FROM modules WHERE id=$1 AND active=true',[payload.moduleId])).rows.length)throw Error('MODULE_NOT_FOUND');
    result=await command(c,a,o,{suspend:'access.suspend',restore:'access.restore',bonus:'subscription.bonus',grant:'module.grant'}[action],payload,reason,key,requestHash);
   }else if(action==='change_plan'||action==='cancel_subscription'){
    const sub=(await c.query("SELECT * FROM subscriptions WHERE organization_id=$1 AND status<>'canceled' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[org])).rows[0];if(!sub)throw Error('SUBSCRIPTION_REQUIRED');
    const payload={subscriptionId:sub.id,expectedSubscriptionRevision:sub.revision};
    if(action==='cancel_subscription'){
     if(input.confirm!==o.firebase_uid)throw Error('CONFIRM_ORGANIZATION_REQUIRED');
     result=await command(c,a,o,'subscription.canceled',payload,reason,key,requestHash);
    }else{
     payload.planId=uuid(input.plan_id);payload.currency=currency(input.currency);
     const price=(await c.query('SELECT amount FROM plan_prices WHERE plan_id=$1 AND currency=$2 AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) ORDER BY valid_from DESC LIMIT 1',[payload.planId,payload.currency])).rows[0];if(!price)throw Error('PRICE_NOT_FOUND');
     payload.amount=price.amount;payload.moduleIds=(await c.query('SELECT module_id FROM plan_modules WHERE plan_id=$1',[payload.planId])).rows.map(m=>m.module_id);
     result=await command(c,a,o,'subscription.plan_changed',payload,reason,key,requestHash);
    }
   }else if(action==='note'){
    const note=String(input.note||'');if(note.length>500)throw Error('INVALID_NOTE');
    const before=(await c.query('SELECT internal_note FROM organization_controls WHERE organization_id=$1',[org])).rows[0]||{};
    await c.query('INSERT INTO organization_controls(organization_id,internal_note) VALUES($1,$2) ON CONFLICT(organization_id) DO UPDATE SET internal_note=$2,updated_at=now()',[org,note]);
    await audit(c,a,org,'organization.note',before,{note,reason});
   }else if(action==='plan'){
    const code=text(input.code,50);if(!/^[a-z0-9_-]+$/.test(code))throw Error('INVALID_CODE');
    const p=(await c.query('INSERT INTO plans(code,title,trial_days) VALUES($1,$2,$3) ON CONFLICT(code) DO UPDATE SET title=$2,trial_days=$3 RETURNING id',[code,text(input.title),integer(input.trial_days,0,365)])).rows[0];
    const cur=currency(input.currency),amount=decimal(money(input.amount));
    await c.query('UPDATE plan_prices SET valid_until=now() WHERE plan_id=$1 AND currency=$2 AND valid_until IS NULL',[p.id,cur]);
    await c.query("INSERT INTO plan_prices(plan_id,currency,amount,billing_interval) VALUES($1,$2,$3,'monthly')",[p.id,cur,amount]);
    const ids=String(input.module_ids||'').split(',').map(s=>s.trim()).filter(Boolean);for(const id of ids)uuid(id);
    await c.query('DELETE FROM plan_modules WHERE plan_id=$1',[p.id]);
    for(const id of new Set(ids)){const found=await c.query('SELECT id FROM modules WHERE id=$1 AND active=true',[id]);if(!found.rows.length)throw Error('MODULE_NOT_FOUND');await c.query('INSERT INTO plan_modules(plan_id,module_id) VALUES($1,$2)',[p.id,id]);}
    await audit(c,a,null,'plan.saved',null,{planId:p.id,code,currency:cur,amount,reason});result={state:'saved',id:p.id};
   }else if(action==='module'){
    const code=text(input.code,50);if(!/^[a-z0-9_-]+$/.test(code))throw Error('INVALID_CODE');
    const m=(await c.query('INSERT INTO modules(code,title) VALUES($1,$2) ON CONFLICT(code) DO UPDATE SET title=$2 RETURNING id',[code,text(input.title)])).rows[0];await audit(c,a,null,'module.saved',null,{...m,reason});
   }else if(action==='subscribe'){
    // Commercial subscription is real in Postgres; access needs an acknowledged command.
    const planId=uuid(input.plan_id),cur=currency(input.currency);
    if((await c.query("SELECT id FROM subscriptions WHERE organization_id=$1 AND status<>'canceled' LIMIT 1",[org])).rows.length)throw Error('ACTIVE_SUBSCRIPTION_EXISTS');
    const price=(await c.query('SELECT amount FROM plan_prices WHERE plan_id=$1 AND currency=$2 AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) ORDER BY valid_from DESC LIMIT 1',[planId,cur])).rows[0];if(!price)throw Error('PRICE_NOT_FOUND');
    const ends=date(input.ends_at),starts=date(input.starts_at);if(ends<=starts)throw Error('INVALID_PERIOD');
    const s=(await c.query("INSERT INTO subscriptions(organization_id,plan_id,status,starts_at,ends_at,currency,recurring_amount,billing_day,grace_days) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",[org,planId,input.status==='trial'?'trial':'active',starts,ends,cur,price.amount,integer(input.billing_day,1,28),integer(input.grace_days,0,90)])).rows[0];
    result=await command(c,a,o,'subscription.changed',{subscriptionId:s.id,planId,status:input.status==='trial'?'trial':'active',endsAt:ends},reason,key,requestHash);
   }else if(action==='invoice'){
    const inv=(await c.query("INSERT INTO invoices(organization_id,currency,total,due_at,status) VALUES($1,$2,$3,$4,'issued') RETURNING id",[org,currency(input.currency),decimal(money(input.amount,{positive:true})),date(input.due_at)])).rows[0];await audit(c,a,org,'invoice.issued',null,{...inv,reason});result={state:'saved',...inv};
   }else if(['payment','discount','void'].includes(action)){
    const inv=(await c.query('SELECT * FROM invoices WHERE id=$1 FOR UPDATE',[uuid(input.invoice_id)])).rows[0];if(!inv||inv.status==='void')throw Error('INVOICE_NOT_FOUND');org=inv.organization_id;
    const paid=(await c.query("SELECT COALESCE(SUM(amount),0)::text amount FROM payments WHERE invoice_id=$1 AND status='confirmed'",[inv.id])).rows[0].amount;
    const total=money(inv.total),paidAmount=money(paid),discount=money(inv.discount);
    if(action==='void'){if(paidAmount>0n)throw Error('PAID_INVOICE_CANNOT_VOID');await c.query("UPDATE invoices SET status='void' WHERE id=$1",[inv.id]);}
    if(action==='discount'){
     const value=money(input.amount);if(value+paidAmount>total)throw Error('DISCOUNT_EXCEEDS_BALANCE');
     await c.query("UPDATE invoices SET discount=$2,status=CASE WHEN total-$2=0 THEN 'paid' WHEN $3::numeric=total-$2 THEN 'paid' WHEN $3::numeric>0 THEN 'partial' ELSE 'issued' END WHERE id=$1",[inv.id,decimal(value),paid]);
    }
    if(action==='payment'){
     if(currency(input.currency)!==inv.currency.trim())throw Error('CURRENCY_MISMATCH');const amount=money(input.amount,{positive:true});if(amount+paidAmount>total-discount)throw Error('OVERPAYMENT');
     await c.query("INSERT INTO payments(invoice_id,currency,amount,status,provider,provider_reference) VALUES($1,$2,$3,'confirmed','manual',$4)",[inv.id,inv.currency,decimal(amount),key]);
     await c.query("UPDATE invoices SET status=$2 WHERE id=$1",[inv.id,amount+paidAmount===total-discount?'paid':'partial']);
    }
    await audit(c,a,org,'invoice.'+action,inv,{reason,amount:input.amount||null});
   }else if(action==='request'){
    const r=(await c.query("SELECT * FROM commercial_requests WHERE id=$1 AND status IN ('pending','reviewing') FOR UPDATE",[uuid(input.request_id)])).rows[0];if(!r)throw Error('REQUEST_NOT_FOUND');
    if(!['reviewing','rejected','canceled'].includes(input.status))throw Error('REQUEST_APPROVAL_REQUIRES_COMMAND');
    await c.query('UPDATE commercial_requests SET status=$2 WHERE id=$1',[r.id,input.status]);await audit(c,a,r.organization_id,'request.'+input.status,r,{reason});
   }
   await c.query('INSERT INTO administrative_receipts(idempotency_key,actor_id,request_hash,result) VALUES($1,$2,$3,$4::jsonb)',[key,a.id,requestHash,JSON.stringify(result)]);return result;
  });
 }
 async function snapshot(session){
  const reader=await actor(pool,session);
  const queries={
   plans:`SELECT p.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('currency',currency,'amount',amount)) FROM plan_prices WHERE plan_id=p.id AND valid_until IS NULL),'[]') prices,COALESCE((SELECT array_agg(module_id) FROM plan_modules WHERE plan_id=p.id),ARRAY[]::uuid[]) module_ids FROM plans p ORDER BY code LIMIT 100`,
   modules:'SELECT * FROM modules ORDER BY code LIMIT 100',
   invoices:`SELECT i.*,o.display_name,COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id AND status='confirmed'),0) paid FROM invoices i JOIN organizations o ON o.id=i.organization_id ORDER BY i.due_at DESC,i.id LIMIT 25`,
   revenue:`SELECT p.currency,to_char(p.created_at,'YYYY-MM') AS month_label,SUM(p.amount)::text amount FROM payments p WHERE p.status='confirmed' GROUP BY p.currency,to_char(p.created_at,'YYYY-MM') ORDER BY month_label DESC LIMIT 48`,
   activities:`SELECT a.id,a.action,a.occurred_at,o.display_name FROM audit_events a LEFT JOIN organizations o ON o.id=a.organization_id ORDER BY a.occurred_at DESC,a.id DESC LIMIT 20`,
   requests:`SELECT r.*,o.display_name FROM commercial_requests r JOIN organizations o ON o.id=r.organization_id ORDER BY r.created_at DESC LIMIT 25`,
   growth:`SELECT to_char(created_at,'YYYY-MM') AS month_label,COUNT(*)::integer total FROM organizations GROUP BY to_char(created_at,'YYYY-MM') ORDER BY month_label DESC LIMIT 12`,
   commands:`SELECT c.id,c.organization_id,c.command_type,c.state,c.created_at,o.display_name FROM administrative_commands c JOIN organizations o ON o.id=c.organization_id ORDER BY c.created_at DESC LIMIT 25`
  };
  const result={};for(const [k,sql] of Object.entries(queries)){if(['invoices','revenue'].includes(k)&&!reader.roles.some(r=>['owner','billing','auditor'].includes(r))){result[k]=[];continue;}result[k]=(await pool.query(sql)).rows;}return result;
 }
 async function detail(session,id){await actor(pool,session);uuid(id);const result={};for(const [key,sql] of Object.entries({subscriptions:'SELECT s.*,p.title plan FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 10',history:'SELECT action,occurred_at,after_state FROM audit_events WHERE organization_id=$1 ORDER BY occurred_at DESC LIMIT 25',commands:'SELECT id,command_type,state,reason,created_at FROM administrative_commands WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 10'}))result[key]=(await pool.query(sql,[id])).rows;return result;}
 async function recurring(){return transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('control-center-recurring'))");
  const r=await c.query(`INSERT INTO invoices(organization_id,subscription_id,period_key,currency,total,due_at,status)
   SELECT s.organization_id,s.id,to_char(m,'YYYY-MM'),s.currency,s.recurring_amount,
   (date_trunc('month',m)+(s.billing_day-1)*interval '1 day'), 'issued'
   FROM subscriptions s CROSS JOIN LATERAL generate_series(date_trunc('month',s.starts_at),date_trunc('month',LEAST(COALESCE(s.ends_at,now()),now())),interval '1 month') m
   WHERE s.status IN ('active','past_due','grace') AND s.currency IS NOT NULL AND s.recurring_amount>0 AND s.billing_day IS NOT NULL
   AND date_trunc('month',m)+(s.billing_day-1)*interval '1 day'>=s.starts_at
   AND date_trunc('month',m)+(s.billing_day-1)*interval '1 day'<=now()
   AND (s.ends_at IS NULL OR date_trunc('month',m)+(s.billing_day-1)*interval '1 day'<s.ends_at)
   ON CONFLICT(subscription_id,period_key) DO NOTHING RETURNING id,organization_id`);
  for(const i of r.rows)await c.query("INSERT INTO audit_events(organization_id,action,after_state) VALUES($1,'invoice.recurring',$2::jsonb)",[i.organization_id,JSON.stringify({invoiceId:i.id})]);
  await c.query("UPDATE invoices SET status='overdue' WHERE status='issued' AND due_at<now()");return r.rows.length;
 });}
 return {mutate,snapshot,detail,recurring};
}
