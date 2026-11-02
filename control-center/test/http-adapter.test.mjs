import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createNodeHttpHandler} from '../src/server/http-adapter.mjs';
import {createAdminApi} from '../src/api/http.mjs';
const repo={getOverview:async()=>({organizations:1}),listOrganizations:async()=>[{id:'org-demo',display_name:'Demo'}]};
test('endpoints privados negam HTTP sem sessão e não expõem dados',async()=>{
 const app=createAdminApi({verifySession:async()=>null,repository:repo});
 const server=createServer(createNodeHttpHandler(app)); server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const base='http://127.0.0.1:'+server.address().port;
 const denied=await fetch(base+'/api/organizations');assert.equal(denied.status,401);assert.equal((await denied.json()).error,'UNAUTHENTICATED');
 const health=await fetch(base+'/health');assert.equal(health.status,200);assert.equal((await health.json()).status,'ok');
 const notfound=await fetch(base+'/api/payments');assert.equal(notfound.status,404);
 }finally{server.close();await once(server,'close')}
});
test('adapter retorna 503 sem vazamento em exceção',async()=>{
 const handler=createNodeHttpHandler(async()=>{throw Error('database-password-test')});
 const res={writeHead(code,headers){this.code=code;this.headers=headers},end(body){this.body=body}};
 await handler({url:'/api/overview',method:'GET',headers:{}},res);
 assert.equal(res.code,503);assert.equal(res.body.includes('database-password-test'),false);
});
