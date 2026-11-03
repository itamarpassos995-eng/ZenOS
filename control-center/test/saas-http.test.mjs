import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthHttp} from '../src/server/auth-http.mjs';
import {syncCsrf} from '../src/server/organization-sync.mjs';
const origin='https://cc.test',token='session-test';
function fixture(){const calls=[];const handle=createAuthHttp({origin,clientId:'client',clientSecret:'secret',verifyGoogle:async()=>null,store:{verifySession:async()=>({subject:'owner',mfaVerified:true,roles:['owner']})},handleApi:async()=>({status:200,body:{organizations:0}}),saas:{mutate:async(a,i)=>{calls.push(i);return {state:'saved'};}}});return {calls,handle};}
test('HTTP administrativo exige sessão, origem e CSRF e preserva filtros após POST',async()=>{
 const f=fixture(),input={action:'note',id:'org',key:'unique-idempotency-key',note:'Interna',reason:'Motivo autorizado',csrf:syncCsrf(token),return_q:'Empresa A',return_page:'3',return_country:'PY',return_status:'active',return_sort:'name',return_manage:'org'};
 const body=new URLSearchParams(input).toString(),headers={origin,cookie:'zenos_admin_session='+token};
 assert.equal((await f.handle({method:'POST',url:'/clientes',headers:{...headers,origin:'https://evil.test'},body})).status,403);
 assert.equal((await f.handle({method:'POST',url:'/clientes',headers,body:body.replace(input.csrf,'invalid')})).status,403);
 assert.equal(f.calls.length,0);
 const r=await f.handle({method:'POST',url:'/clientes',headers,body});assert.equal(r.status,303);
 assert.equal(new URL(r.headers.location,origin).searchParams.get('page'),'3');assert.equal(new URL(r.headers.location,origin).searchParams.get('country'),'PY');assert.equal(f.calls.length,1);assert.equal(f.calls[0].csrf,undefined);
 assert.equal((await f.handle({method:'POST',url:'/planos',headers,body})).status,400);
});
test('endpoint de eventos permanece desativado sem configuração explícita',async()=>{
 const f=fixture();assert.equal((await f.handle({method:'POST',url:'/internal/events',headers:{},body:'{}'})).status,503);assert.equal(f.calls.length,0);
});
