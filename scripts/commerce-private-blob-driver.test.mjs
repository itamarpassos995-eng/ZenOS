import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateBlobDriver,privateStoreReady} from '../api/commerce/_lib/privateBlobStore.js';

const validPath='commerce/pedidos/loja-1/pendentes/ON-'+'A'.repeat(24)+'.json';
const archivedPath=validPath.replace('/pendentes/','/arquivados/');
const current={
 token:process.env.ZENOS_COMMERCE_PRIVATE_BLOB_READ_WRITE_TOKEN,
 store:process.env.ZENOS_COMMERCE_PRIVATE_BLOB_STORE_ID,
 publicToken:process.env.BLOB_READ_WRITE_TOKEN,
};
test.after(()=>{
 for(const [key,value] of Object.entries({
  ZENOS_COMMERCE_PRIVATE_BLOB_READ_WRITE_TOKEN:current.token,
  ZENOS_COMMERCE_PRIVATE_BLOB_STORE_ID:current.store,
  BLOB_READ_WRITE_TOKEN:current.publicToken
 })){if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
const configure=()=>{
 process.env.ZENOS_COMMERCE_PRIVATE_BLOB_READ_WRITE_TOKEN='vercel_blob_rw_just_a_test';
 process.env.ZENOS_COMMERCE_PRIVATE_BLOB_STORE_ID='Ub5FhVPSfclqNq5p';
 process.env.BLOB_READ_WRITE_TOKEN='vercel_blob_rw_PUBLIC_TOKEN_MUST_NOT_BE_USED';
};

test('credencial publica nunca substitui a privada',async()=>{
 delete process.env.ZENOS_COMMERCE_PRIVATE_BLOB_READ_WRITE_TOKEN;
 process.env.BLOB_READ_WRITE_TOKEN='vercel_blob_rw_PUBLIC';
 assert.equal(privateStoreReady(),false);
 let touched=0;
 const adapter=createPrivateBlobDriver({sdk:async()=>({put:async()=>{touched++;}})});
 await assert.rejects(adapter.putPrivate(validPath,{id:'test'}),/credencial-privada-indisponivel/);
 assert.equal(touched,0);
});

test('put usa token privado, access private e nunca sobrepoe um pedido existente',async()=>{
 configure();
 let options,receivedPath,data;
 const adapter=createPrivateBlobDriver({sdk:async()=>({
   put:async(path,body,opts)=>{receivedPath=path;data=JSON.parse(body);options=opts;
     return {url:'https://Ub5FhVPSfclqNq5p.private.blob.vercel-storage.com/'+path};}
 })});
 await adapter.putPrivate(validPath,{id:'ON-'+ 'A'.repeat(24)});
 assert.equal(receivedPath,validPath);
 assert.equal(data.id,'ON-'+ 'A'.repeat(24));
 assert.equal(options.access,'private');
 assert.equal(options.allowOverwrite,false);
 assert.equal(options.addRandomSuffix,false);
 assert.equal(options.token,process.env.ZENOS_COMMERCE_PRIVATE_BLOB_READ_WRITE_TOKEN);
 assert.notEqual(options.token,process.env.BLOB_READ_WRITE_TOKEN);
 assert.equal(options.cacheControlMaxAge,60);
});

test('somente caminhos da loja e de pedidos sao permitidos',async()=>{
 configure();
 const adapter=createPrivateBlobDriver({sdk:async()=>({
  put:async()=>{throw Error('nao deve gravar');},del:async()=>{throw Error('nao deve apagar');}
 })});
 for(const path of ['catalogos/test.json','commerce/pedidos/../admin/pendentes/aaa.json',
  'commerce/pedidos/loja-1/pendentes/pedido-invalid.json']){
  await assert.rejects(adapter.putPrivate(path,{x:1}),/caminho-privado-invalido/);
  await assert.rejects(adapter.deletePrivate(path),/caminho-privado-invalido/);
 }
});

test('ler nao usa cache e retorna JSON privado',async()=>{
 configure();let opts,received;
 const payload={id:'ON-'+ 'A'.repeat(24),clienteNome:'Teste'};
 const stream=new ReadableStream({start(ctrl){ctrl.enqueue(new TextEncoder().encode(JSON.stringify(payload)));ctrl.close();}});
 const adapter=createPrivateBlobDriver({sdk:async()=>({get:async(path,options)=>{
   received=path;opts=options;
   return {statusCode:200,blob:{size:90},stream};
 }})});
 const got=await adapter.readPrivate(validPath);
 assert.deepEqual(got,payload);
 assert.equal(received,validPath);
 assert.equal(opts.access,'private');
 assert.equal(opts.useCache,false);
 assert.equal(opts.token,process.env.ZENOS_COMMERCE_PRIVATE_BLOB_READ_WRITE_TOKEN);
});

test('listagem limitada a um uid autenticado com prefixo sem ler Firestore',async()=>{
 configure();let opts;
 const adapter=createPrivateBlobDriver({sdk:async()=>({list:async options=>{
  opts=options;return {blobs:[],hasMore:false};
 }})});
 const got=await adapter.listPrivate('loja-1');
 assert.deepEqual(got.blobs,[]);
 assert.equal(opts.prefix,'commerce/pedidos/loja-1/pendentes/');
 assert.equal(opts.limit,80);
 await assert.rejects(adapter.listPrivate('../loja-2'),/uid-invalido/);
});

test('arquiva sem acesso publico e suporta conflito de idempotencia',async()=>{
 configure();let deleted;
 const adapter=createPrivateBlobDriver({sdk:async()=>({
  del:async(path,options)=>{deleted={path,options};},
  put:async()=>{throw Object.assign(new Error('already exists'),{status:409});}
 })});
 await assert.rejects(adapter.putPrivate(validPath,{id:'p'}),/pedido-ja-registrado/);
 await adapter.deletePrivate(validPath);
 assert.equal(deleted.path,validPath);
 assert.equal(deleted.options.token,process.env.ZENOS_COMMERCE_PRIVATE_BLOB_READ_WRITE_TOKEN);
 assert.ok(archivedPath.includes('/arquivados/'));
});
