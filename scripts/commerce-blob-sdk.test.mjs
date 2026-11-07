import test from 'node:test';
import assert from 'node:assert/strict';
import {putPublicBlob} from '../api/commerce/_lib/commerceGoogle.js';

test('usa SDK oficial com token e caminho fixo, sem ID hardcoded de store',async()=>{
 const previous=process.env.BLOB_READ_WRITE_TOKEN;
 process.env.BLOB_READ_WRITE_TOKEN='token-teste';
 try{
  const calls=[];
  const pathname='commerce/catalogos/loja-teste.json';
  const url=await putPublicBlob(pathname,'{}',{putImpl:async(...args)=>{
   calls.push(args);return {url:'https://abc.public.blob.vercel-storage.com/'+pathname};
  }});
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],pathname);
  assert.equal(calls[0][2].token,'token-teste');
  assert.equal(calls[0][2].addRandomSuffix,false);
  assert.equal(calls[0][2].allowOverwrite,true);
  assert.equal(url,'https://abc.public.blob.vercel-storage.com/'+pathname);
 }finally{if(previous===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;else process.env.BLOB_READ_WRITE_TOKEN=previous;}
});
test('falha segura sem token, caminho valido ou resposta valida',async()=>{
 const previous=process.env.BLOB_READ_WRITE_TOKEN;
 delete process.env.BLOB_READ_WRITE_TOKEN;
 try{await assert.rejects(putPublicBlob('commerce/catalogos/loja-teste.json','{}'),/blob-credencial-indisponivel/);}
 finally{if(previous===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;else process.env.BLOB_READ_WRITE_TOKEN=previous;}
});

test('recusa escrita em store diferente da origem pública configurada',async()=>{
 const priorToken=process.env.BLOB_READ_WRITE_TOKEN;
 const priorOrigin=process.env.ZENOS_COMMERCE_CDN_ORIGIN;
 process.env.BLOB_READ_WRITE_TOKEN='token-teste';
 process.env.ZENOS_COMMERCE_CDN_ORIGIN='https://store-oficial.public.blob.vercel-storage.com/';
 try{
  await assert.rejects(putPublicBlob('commerce/catalogos/loja-teste.json','{}',{
   putImpl:async()=>({url:'https://outra-store.public.blob.vercel-storage.com/commerce/catalogos/loja-teste.json'})
  }),/blob-origem-divergente/);
  assert.equal(await putPublicBlob('commerce/catalogos/loja-teste.json','{}',{
   putImpl:async()=>({url:'https://store-oficial.public.blob.vercel-storage.com/commerce/catalogos/loja-teste.json'})
  }),'https://store-oficial.public.blob.vercel-storage.com/commerce/catalogos/loja-teste.json');
 }finally{
  if(priorToken===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;else process.env.BLOB_READ_WRITE_TOKEN=priorToken;
  if(priorOrigin===undefined)delete process.env.ZENOS_COMMERCE_CDN_ORIGIN;else process.env.ZENOS_COMMERCE_CDN_ORIGIN=priorOrigin;
 }
});
