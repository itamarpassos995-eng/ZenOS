import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createPrivateInboxHandler,submitOrder} from '../api/commerce/inbox.js';

const rawEnv={
 enabled:process.env.ZENOS_COMMERCE_PRIVATE_INBOX_ENABLED,
 token:process.env.ZENOS_COMMERCE_PRIVATE_BLOB_READ_WRITE_TOKEN,
 waf:process.env.ZENOS_COMMERCE_INBOX_WAF_READY,
};
test.after(()=>{
 for(const [key,value] of Object.entries({
  ZENOS_COMMERCE_PRIVATE_INBOX_ENABLED:rawEnv.enabled,
  ZENOS_COMMERCE_PRIVATE_BLOB_READ_WRITE_TOKEN:rawEnv.token,
  ZENOS_COMMERCE_INBOX_WAF_READY:rawEnv.waf
 })){if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
const enabled=()=>{
  process.env.ZENOS_COMMERCE_PRIVATE_INBOX_ENABLED='true';
  process.env.ZENOS_COMMERCE_PRIVATE_BLOB_READ_WRITE_TOKEN='vercel_blob_rw_mock_only';
  process.env.ZENOS_COMMERCE_INBOX_WAF_READY='true';
};
function res(){
 return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;return this;},
   status(c){this.code=c;return this;},json(v){this.value=v;return this;}};
}
const base={
 slug:'zeniteatacadao',requestId:'f9ac2474-5469-4cc3-8a67-9c524b33a0af',
 cliente:{nome:'Cliente de Teste',telefone:'(67) 99999-0000'},
 entrega:{tipo:'retirada'},pagamento:{forma:'pix'},
 itens:[{id:'p1',quantidade:4,precoCentavos:1}],
};
const shop={lojaId:'loja-teste-123',config:{habilitado:true,slug:'zeniteatacadao',
  nomeLoja:'Zênite',produtosLoja:{p1:{ativo:true,precoPromoBRL:38}}},
  produtos:[{id:'p1',nome:'Meia cana de Forro PVC',estoque:30,precoBRL:40}]};

test('valores são calculados no servidor com catálogo, nunca pelo cliente',async()=>{
 let path,data;
 const result=await submitOrder(base,{
  catalog:async slug=>{assert.equal(slug,'zeniteatacadao');return shop;},
  write:async(p,d)=>{path=p;data=d;},
  now:()=>new Date('2026-10-29T23:00:00Z'),
 });
 assert.equal(result.totalCentavos,15200);
 assert.equal(data.totalBRL,152);
 assert.equal(data.itens[0].precoUnitarioBRL,38);
 assert.equal(data.clienteNome,'Cliente de Teste');
 assert.match(path,/^commerce\/pedidos\/loja-teste-123\/pendentes\/ON-[A-F0-9]{24}\.json$/);
});
test('nunca grava pedido com estoque insuficiente ou total inválido',async()=>{
 let writes=0;
 await assert.rejects(submitOrder({...base,itens:[{id:'p1',quantidade:31}]},{
  catalog:async()=>shop,write:async()=>{writes++;}
 }),/estoque-ou-quantidade-invalida/);
 assert.equal(writes,0);
});
test('se armazenamento privado ou proteção não estiver ativo, o POST falha fechado',async()=>{
 delete process.env.ZENOS_COMMERCE_PRIVATE_INBOX_ENABLED;
 const handler=createPrivateInboxHandler({submit:async()=>{throw Error('não deve gravar');}});
 const out=res();
 await handler({method:'POST',headers:{},body:base},out);
 assert.equal(out.code,503);
 assert.equal(out.value.erro,'integracao-em-preparacao');
});
test('fila exige token assinado e nunca aceita identidade arbitrária no query',async()=>{
 enabled();let consulted;
 const handler=createPrivateInboxHandler({
  verify:async()=>({uid:'dono-123'}),
  list:async uid=>{consulted=uid;return {blobs:[
    {pathname:'commerce/pedidos/dono-123/pendentes/ON-'+('A'.repeat(24))+'.json',
      uploadedAt:'2026-10-29T00:00:00Z'},
    {pathname:'commerce/pedidos/outra-loja/pendentes/ON-'+('B'.repeat(24))+'.json',
      uploadedAt:'2026-10-29T00:00:00Z'}
  ]};}
 });
 const no=res();await handler({method:'GET',headers:{},query:{uid:'outra-loja'}},no);
 assert.equal(no.code,401);
 const yes=res();await handler({method:'GET',headers:{authorization:'Bearer mock'},query:{uid:'outra-loja'}},yes);
 assert.equal(yes.code,200);
 assert.equal(consulted,'dono-123');
 assert.equal(yes.value.pedidos.length,1);
});
test('arquivo mantém cópia privada antes de retirar da fila',async()=>{
 enabled();let writes=[],deletes=0;
 const id='ON-'+('A'.repeat(24));
 const handler=createPrivateInboxHandler({
  verify:async()=>({uid:'dono-123'}),
  get:async()=>({id,itens:[{id:'p1',quantidade:2}],clienteNome:'Cliente'}),
  put:async(path,doc)=>{writes.push({path,doc});},
  remove:async()=>{deletes++;assert.equal(writes.length,1);}
 });
 const out=res();
 await handler({method:'PATCH',query:{id},body:{acao:'arquivar'},
  headers:{authorization:'Bearer token'}},out);
 assert.equal(out.code,200);
 assert.equal(deletes,1);
 assert.match(writes[0].path,/\/arquivados\//);
});
test('um pedido sem dados não pode abrir caixa',async()=>{
 enabled();
 const id='ON-'+('A'.repeat(24));
 const handler=createPrivateInboxHandler({
  verify:async()=>({uid:'dono-123'}),get:async()=>null
 });
 const out=res();
 await handler({method:'GET',query:{id},headers:{authorization:'Bearer tok'}},out);
 assert.equal(out.code,404);
});
test('frontend não adiciona listeners ou altera cache do Firestore',()=>{
 const before=path=>execFileSync('git',['show','origin/main:'+path],{encoding:'utf8'});
 const count=s=>(s.match(/\bonSnapshot\s*\(/g)||[]).length;
 for(const path of ['src/App.jsx','src/components/PDV.jsx']){
  const old=before(path),current=readFileSync(path,'utf8');
  assert.equal(count(current),count(old),path);
 }
 const source=readFileSync('api/commerce/inbox.js','utf8');
 assert.doesNotMatch(source,/from ['"][^'"]*firebase\/firestore/);
 assert.doesNotMatch(source,/\bgetDocs\b|\bonSnapshot\b|\bgetDoc\b/);
 assert.match(readFileSync('api/commerce/_lib/privateBlobStore.js','utf8'),/private\\.blob\\.vercel-storage\\.com/);
 assert.doesNotMatch(readFileSync('src/components/CommerceOrderInbox.jsx','utf8'),/firebase\/firestore/);
});

test('mesmo pedido após falha de resposta é idempotente e não faz nova gravação',async()=>{
 const id='ON-'+(await import('node:crypto')).createHash('sha256')
   .update('loja-teste-123:'+base.requestId).digest('hex').slice(0,24).toUpperCase();
 let count=0,original;
 const written=async(path,pedido)=>{
   count++;
   original=pedido;
   throw Error('pedido-ja-registrado');
 };
 const repeated=await submitOrder(base,{
   catalog:async()=>shop,
   write:written,
   read:async()=>original,
 });
 assert.equal(count,1);
 assert.equal(repeated.id,id);
 assert.equal(repeated.totalCentavos,15200);
 assert.equal(repeated.duplicado,true);
});
test('não aceita reutilizar protocolo para conteúdo de outro consumidor',async()=>{
 await assert.rejects(submitOrder(base,{
   catalog:async()=>shop,
   write:async()=>{throw Error('pedido-ja-registrado');},
   read:async()=>({id:'ON-'+(await import('node:crypto')).createHash('sha256')
     .update('loja-teste-123:'+base.requestId).digest('hex').slice(0,24).toUpperCase(),
     idempotencyHash:'hash-de-outra-compra'})
 }),/chave-pedido-reutilizada/);
});
test('POST não confirma pedido quando Blob privado falhar',async()=>{
 enabled();
 const handler=createPrivateInboxHandler({submit:async()=>{throw Error('fila-gravacao-indisponivel')}});
 const response=res();await handler({method:'POST',headers:{},body:base},response);
 assert.equal(response.code,503);
 assert.equal(response.value.erro,'pedido-nao-confirmado');
});
