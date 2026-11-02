import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes,createHmac} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createAuthStore,createSecretBox,hash} from '../src/server/auth-store.mjs';
import {createAuthHttp} from '../src/server/auth-http.mjs';
import {createAdminApi} from '../src/api/http.mjs';
import {createPostgresRepository} from '../src/api/postgres-repository.mjs';
import {createSessionVerifier} from '../src/server/session.mjs';
const origin='https://control.example.test';
function totp(secret,time){let bits=0,value=0,a=[];for(const c of secret){value=(value<<5)|'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);bits+=5;if(bits>=8){bits-=8;a.push((value>>>bits)&255);}}
 const input=Buffer.alloc(8);input.writeBigUInt64BE(BigInt(Math.floor(time/30000)));const h=createHmac('sha1',Buffer.from(a)).update(input).digest(),o=h[19]&15;
 return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0');}
async function fixture(){
 const db=new PGlite();
 for(const name of ['001_foundation.sql','002_admin_mfa_state.sql','003_admin_auth.sql']){
  const sql=await readFile(new URL('../migrations/'+name,import.meta.url),'utf8');
  // PGlite includes gen_random_uuid, but not Render's pgcrypto extension package.
  await db.exec(sql.replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
 }
 const pool={query:(s,p)=>db.query(s,p),connect:async()=>({query:(s,p)=>db.query(s,p),release(){}})};
 let time=1800000000000;
 const store=createAuthStore({pool,box:createSecretBox(randomBytes(32).toString('base64')),bootstrapEmail:'owner@example.test',now:()=>time});
 const api=createAdminApi({verifySession:createSessionVerifier({verifyProviderToken:store.verifySession}),repository:createPostgresRepository(pool)});
 let expectedNonce;
 const handle=createAuthHttp({store,origin,clientId:'client',clientSecret:'secret',handleApi:api,
  verifyGoogle:async(token,nonce)=>token==='valid'&&nonce===expectedNonce?{issuerVerified:true,subject:'google:123',email:'owner@example.test'}:null,
  fetchImpl:async(url,options)=>{assert.equal(url,'https://oauth2.googleapis.com/token');assert.ok(options.body.get('code_verifier'));return {ok:true,json:async()=>({id_token:'valid'})};}});
 return {db,store,handle,time:()=>time,advance:n=>{time+=n},setNonce:n=>{expectedNonce=n}};
}
function jar(result){return (Array.isArray(result.headers['set-cookie'])?result.headers['set-cookie']:[result.headers['set-cookie']]).filter(Boolean).map(x=>x.split(';')[0]).join('; ');}
async function google(f){const start=await f.handle({url:'/auth/login'}),url=new URL(start.headers.location);f.setNonce(url.searchParams.get('nonce'));
 const callback='/auth/google/callback?state='+url.searchParams.get('state')+'&code=code';
 const response=await f.handle({url:callback,headers:{cookie:jar(start)}});assert.equal(response.headers.location,'/auth/mfa');return {response,start,callback};}
test('fluxo completo PostgreSQL: Google → enrollment → TOTP → API → logout',async()=>{
 const f=await fixture();try{
  const {response,start,callback}=await google(f),cookie=jar(response);
  assert.equal((await f.handle({url:callback,headers:{cookie:jar(start)}})).status,401,'OAuth state não reutilizável');
  assert.equal((await f.handle({url:'/api/overview',headers:{cookie}})).status,401,'Google sem MFA não acessa');
  const mfa=await f.handle({url:'/auth/mfa',headers:{cookie}});assert.equal(mfa.status,200);
  const secret=mfa.body.match(/<code>([A-Z2-7]+)<\/code>/)[1],csrf=mfa.body.match(/name="csrf" value="([^"]+)"/)[1];
  const body=new URLSearchParams({csrf,code:totp(secret,f.time())}).toString();
  assert.equal((await f.handle({method:'POST',url:'/auth/mfa',headers:{cookie,origin:'https://evil.test'},body})).status,403);
  const login=await f.handle({method:'POST',url:'/auth/mfa',headers:{cookie,origin},body});assert.equal(login.status,303);
  const session=jar(login);
  assert.equal((await f.handle({url:'/api/overview',headers:{cookie:session}})).status,200);
  assert.equal((await f.handle({url:'/',headers:{cookie:session}})).status,200);
  assert.equal((await f.handle({method:'POST',url:'/auth/mfa',headers:{cookie,origin},body})).status,401);
  const again=await google(f);const next=await f.handle({url:'/auth/mfa',headers:{cookie:jar(again.response)}});
  assert.ok(!next.body.includes(secret),'segredo nunca reaparece após enrollment');
  await f.handle({method:'POST',url:'/auth/logout',headers:{cookie:session,origin}});
  assert.equal((await f.handle({url:'/api/overview',headers:{cookie:session}})).status,401);
 }finally{await f.db.close();}
});
test('MFA: cinco falhas bloqueiam, expiração libera nova tentativa e código não repete',async()=>{
 const f=await fixture();try{
 const {response}=await google(f),cookie=jar(response),view=await f.handle({url:'/auth/mfa',headers:{cookie}});
 const secret=view.body.match(/<code>([A-Z2-7]+)<\/code>/)[1],csrf=view.body.match(/name="csrf" value="([^"]+)"/)[1];
 const send=code=>f.handle({method:'POST',url:'/auth/mfa',headers:{cookie,origin},body:new URLSearchParams({csrf,code}).toString()});
 for(let i=0;i<5;i++)assert.equal((await send('bad')).status,401);
 assert.equal((await send(totp(secret,f.time()))).status,401);
 f.advance(901000);
 const second=await google(f),cookie2=jar(second.response),view2=await f.handle({url:'/auth/mfa',headers:{cookie:cookie2}});
 const csrf2=view2.body.match(/name="csrf" value="([^"]+)"/)[1];
 assert.equal((await f.handle({method:'POST',url:'/auth/mfa',headers:{cookie:cookie2,origin},body:new URLSearchParams({csrf:csrf2,code:totp(secret,f.time())}).toString()})).status,303);
 }finally{await f.db.close();}
});
test('identidade não autorizada não cria admin; sessão expira e desativação revoga acesso',async()=>{
 const f=await fixture();try{
 assert.equal(await f.store.authorizeGoogle({issuerVerified:true,subject:'google:evil',email:'evil@test'}),null);
 const id=await f.store.authorizeGoogle({issuerVerified:true,subject:'google:123',email:'owner@example.test'});
 await f.db.query('UPDATE admin_mfa_state SET enabled=true WHERE admin_id=$1',[id]);
 await f.db.query('INSERT INTO admin_sessions(token_hash,admin_id,expires_at) VALUES($1,$2,$3)',[hash('session'),id,new Date(f.time()+1000)]);
 assert.ok(await f.store.verifySession('session'));
 await f.db.query('UPDATE admin_users SET active=false WHERE id=$1',[id]);
 assert.equal(await f.store.verifySession('session'),null);
 await f.db.query('UPDATE admin_users SET active=true WHERE id=$1',[id]);
 f.advance(1001);assert.equal(await f.store.verifySession('session'),null);
 assert.equal(await f.store.verifySession('unknown'),null);
 const tables=await f.db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
 assert.equal(tables.rows.length,21);
 }finally{await f.db.close();}
});
test('criptografia: contexto errado, chave errada e alteração do ciphertext falham',()=>{
 const box=createSecretBox(randomBytes(32).toString('base64')),sealed=box.seal('secret','admin');
 assert.equal(box.open(sealed,'admin'),'secret');assert.throws(()=>box.open(sealed,'other'));
 const other=createSecretBox(randomBytes(32).toString('base64'));assert.throws(()=>other.open(sealed,'admin'));
 assert.throws(()=>createSecretBox('weak'));
});
