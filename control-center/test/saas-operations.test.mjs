import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
import {createSaasService} from '../src/server/saas-service.mjs';
import {ensureOperationsSchema,listOrganizationControls} from '../src/server/organization-operations.mjs';
import {migrateOperations} from '../src/server/migrations.mjs';
import {processCommercialEvent} from '../src/server/event-processor.mjs';
import {createIntegration,signature,verifySignature} from '../src/server/integration.mjs';
const owner={subject:'google:owner',mfaVerified:true};
async function fixture(){
 const db=new PGlite();await db.exec((await readFile(new URL('../migrations/001_foundation.sql',import.meta.url),'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
 const pool={query:async(s,p)=>{if(!p&&s.split(';').length>2){await db.exec(s);return {rows:[]};}const r=await db.query(s,p);return {...r,rowCount:r.affectedRows??r.rows.length};},connect:async()=>({query:(s,p)=>pool.query(s,p),release(){}})};
 await ensureOperationsSchema(pool);await migrateOperations(pool);await migrateOperations(pool);
 const admin=(await db.query("INSERT INTO admin_users(external_subject,email) VALUES('google:owner','owner@test.local') RETURNING id")).rows[0];await db.query("INSERT INTO admin_roles(admin_id,role) VALUES($1,'owner')",[admin.id]);
 const org=(await db.query("INSERT INTO organizations(firebase_uid,display_name,country) VALUES('company_001','Empresa Teste','BR') RETURNING id")).rows[0];
 const other=(await db.query("INSERT INTO organizations(firebase_uid,display_name,country) VALUES('company_002','Outra Empresa','PY') RETURNING id")).rows[0];
 return {db,pool,service:createSaasService(pool),org:org.id,other:other.id};
}
const input=(action,fields={})=>({action,key:randomUUID(),reason:'Teste controlado e autorizado',...fields});
test('SaaS: moedas, idempotência, saldo, isolamento, auditoria e recorrência',async()=>{
 const f=await fixture();try{
  const {service:s,db,org,other}=f;
  const auditor=(await db.query("INSERT INTO admin_users(external_subject,email) VALUES('google:auditor','auditor@test.local') RETURNING id")).rows[0];await db.query("INSERT INTO admin_roles(admin_id,role) VALUES($1,'auditor')",[auditor.id]);
  await assert.rejects(s.mutate({subject:'google:auditor',mfaVerified:true},input('invoice',{id:org,currency:'BRL',amount:'10',due_at:'2026-11-10'})),/FORBIDDEN/);
  await assert.rejects(s.mutate({...owner,mfaVerified:false},input('plan')),/MFA_REQUIRED/);
  await assert.rejects(s.mutate({subject:'forjado',mfaVerified:true},input('plan')),/FORBIDDEN/);
  const p=await s.mutate(owner,input('plan',{code:'basic',title:'Básico',trial_days:'7',currency:'BRL',amount:'100.0000'}));
  const bill=input('invoice',{id:org,currency:'BRL',amount:'100.25',due_at:'2026-11-10'});
  const i=await s.mutate(owner,bill);assert.deepEqual(await s.mutate(owner,bill),i);
  await assert.rejects(s.mutate(owner,{...bill,amount:'200'}),/IDEMPOTENCY_CONFLICT/);
  await assert.rejects(s.mutate(owner,input('payment',{invoice_id:i.id,currency:'USD',amount:'5'})),/CURRENCY_MISMATCH/);
  const partial=input('payment',{invoice_id:i.id,currency:'BRL',amount:'40.10'});await s.mutate(owner,partial);await s.mutate(owner,partial);
  assert.equal((await db.query('SELECT status FROM invoices WHERE id=$1',[i.id])).rows[0].status,'partial');
  await s.mutate(owner,input('discount',{invoice_id:i.id,amount:'10.15'}));
  await assert.rejects(s.mutate(owner,input('void',{invoice_id:i.id})),/PAID_INVOICE_CANNOT_VOID/);
  await assert.rejects(s.mutate(owner,input('payment',{invoice_id:i.id,currency:'BRL',amount:'50.01'})),/OVERPAYMENT/);
  await s.mutate(owner,input('payment',{invoice_id:i.id,currency:'BRL',amount:'50'}));
  assert.equal((await db.query('SELECT status FROM invoices WHERE id=$1',[i.id])).rows[0].status,'paid');
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM payments')).rows[0].n,2);
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM invoices WHERE organization_id=$1',[other])).rows[0].n,0);
  assert.equal((await s.snapshot(owner)).revenue[0].amount,'90.1000');
  await s.mutate(owner,input('subscribe',{id:org,plan_id:p.id,currency:'BRL',starts_at:'2026-01-01',ends_at:'2027-01-01',billing_day:'5',grace_days:'3',status:'active'}));
  const generated=await s.recurring();assert.ok(generated>0);assert.equal(await s.recurring(),0);
  const page=await listOrganizationControls(f.pool,{q:'Empresa',page:1,pageSize:1,country:'BR',status:'active'});assert.equal(page.total,1);assert.equal(page.rows[0].id,org);
  const migrations=await db.query('SELECT COUNT(*)::int n FROM control_center_migrations');assert.equal(migrations.rows[0].n,1);
  assert.ok((await db.query('SELECT COUNT(*)::int n FROM audit_events')).rows[0].n>5);
 }finally{await f.db.close();}
});
test('Comando só aplica bônus após ACK assinado e repetição não concede benefício duas vezes',async()=>{
 const f=await fixture();try{
  const {service:s,db,org,pool}=f;const secret='test-secret-with-at-least-32-characters';
  const p=await s.mutate(owner,input('plan',{code:'basic',title:'Básico',trial_days:'7',currency:'BRL',amount:'100'}));
  await s.mutate(owner,input('subscribe',{id:org,plan_id:p.id,currency:'BRL',starts_at:'2026-01-01',ends_at:'2027-01-01',billing_day:'5',grace_days:'3',status:'active'}));
  let forged=true;
  const integration=createIntegration({pool,secret,origin:'https://integration.test',enabled:true,fetchImpl:async(url,req)=>{
   const command=JSON.parse(req.body);const {createHash}=await import('node:crypto');
   const body=JSON.stringify({commandId:command.commandId,organizationUid:command.organizationUid,revision:command.revision,state:'applied',requestHash:createHash('sha256').update(req.body).digest('hex')});const ts=String(Date.now());
   return {ok:true,text:async()=>body,headers:new Map([['x-zenos-timestamp',ts],['x-zenos-signature',forged?'0'.repeat(64):signature(secret,ts,body)]])};
  }});
  assert.deepEqual(await integration.dispatch(),{failed:true});
  assert.equal((await db.query('SELECT applied_at FROM administrative_commands')).rows[0].applied_at,null);
  forged=false;await db.query('UPDATE outbox_events SET next_attempt_at=now()');assert.deepEqual(await integration.dispatch(),{applied:true});
  const bonus=input('bonus',{id:org,days:'7'});await s.mutate(owner,bonus);
  assert.equal(new Date((await db.query('SELECT ends_at FROM subscriptions')).rows[0].ends_at).toISOString().slice(0,10),'2027-01-01');
  await integration.dispatch();await s.mutate(owner,bonus);await integration.dispatch();
  assert.equal(new Date((await db.query('SELECT ends_at FROM subscriptions')).rows[0].ends_at).toISOString().slice(0,10),'2027-01-08');
  const cmd=await s.mutate(owner,input('suspend',{id:org,confirm:'company_001'}));assert.equal(cmd.state,'pending');
  await assert.rejects(s.mutate(owner,input('restore',{id:org,confirm:'company_001'})),/COMMAND_ALREADY_PENDING/);
  const disabled=createIntegration({pool,secret,origin:'https://integration.test'});assert.deepEqual(await disabled.dispatch(),{disabled:true});
 }finally{await f.db.close();}
});
test('Sincronização: assinatura, reenvio e evento atrasado não revertem nome e país',async()=>{
 const f=await fixture();try{
  const e={eventId:'event-000001',eventType:'organization.registered.v1',version:1,organizationUid:'company_001',source:'zenos-backend',occurredAt:'2026-11-03T10:00:00Z',payload:{displayName:'Nome atualizado',country:'PY'}};
  const process=input=>processCommercialEvent({pool:f.pool,input,verifiedSource:'zenos-backend',verifiedOrganizationUid:input.organizationUid});
  await process(e);assert.equal((await process(e)).duplicate,true);
  await process({...e,eventId:'event-000002',occurredAt:'2026-11-01T10:00:00Z',payload:{displayName:'Nome antigo',country:'BR'}});
  assert.equal((await f.db.query("SELECT display_name FROM organizations WHERE firebase_uid='company_001'")).rows[0].display_name,'Nome atualizado');
  const secret='test-secret-with-at-least-32-characters',body=JSON.stringify(e),ts=String(Date.now());
  assert.equal(verifySignature(secret,ts,body,signature(secret,ts,body)),true);
  assert.equal(verifySignature(secret,ts,body+'x',signature(secret,ts,body)),false);
  assert.equal(verifySignature(secret,String(Date.now()-600000),body,signature(secret,ts,body)),false);
 }finally{await f.db.close();}
});
