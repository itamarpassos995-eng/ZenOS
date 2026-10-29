import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/commerce/catalogo.js';
const previous=process.env.ZENOS_COMMERCE_CDN_ORIGIN;
const originalFetch=globalThis.fetch;
const origin='https://abc123.public.blob.vercel-storage.com';
const data={versao:1,lojaId:'zenos-shop-1',config:{slug:'loja-teste',nomeLoja:'Loja Teste'},
  produtos:[{id:'a',nome:'Tinta',precoBRL:42,estoque:1}]};
function res(){
  return {code:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;return this;},
    status(v){this.code=v;return this;},json(v){this.value=v;return this;}};
}
function upstream(obj,status=200){
  const content=Buffer.from(JSON.stringify(obj));
  return {ok:status>=200&&status<300,status,
    headers:new Headers({'content-length':String(content.length)}),
    body:new ReadableStream({start(c){c.enqueue(content);c.close();}})};
}
test.after(()=>{if(previous===undefined)delete process.env.ZENOS_COMMERCE_CDN_ORIGIN;
  else process.env.ZENOS_COMMERCE_CDN_ORIGIN=previous;globalThis.fetch=originalFetch;});
test('não consulta CDN sem origem autorizada',async()=>{
  delete process.env.ZENOS_COMMERCE_CDN_ORIGIN;
  let count=0;globalThis.fetch=async()=>{count++;throw Error('não deve ser chamada');};
  const r=res();await handler({method:'GET',query:{slug:'loja-teste'}},r);
  assert.equal(r.code,503);assert.equal(count,0);
});
test('não permite URL externa, traversal ou métodos perigosos',async()=>{
  process.env.ZENOS_COMMERCE_CDN_ORIGIN='https://malicioso.example';
  const r=res();await handler({method:'GET',query:{slug:'loja-teste'}},r);assert.equal(r.code,503);
  const t=res();await handler({method:'GET',query:{slug:'../x'}},t);assert.equal(t.code,400);
  const p=res();await handler({method:'POST',query:{slug:'loja-teste'}},p);assert.equal(p.code,405);
});
test('sirva catálogo público somente por domínio Blob confiável',async()=>{
  process.env.ZENOS_COMMERCE_CDN_ORIGIN=origin;
  let requested;
  globalThis.fetch=async(url,options)=>{requested={url:String(url),options};return upstream(data);};
  const r=res();await handler({method:'GET',query:{slug:'loja-teste'}},r);
  assert.equal(r.code,200);assert.equal(r.value.config.nomeLoja,'Loja Teste');
  assert.equal(requested.url,origin+'/commerce/catalogos/loja-teste.json');
  assert.match(r.headers['cache-control'],/s-maxage=60/);
  assert.equal(requested.options.headers.Accept,'application/json');
});
test('não redireciona para Firestore e sinaliza ausência de publicação',async()=>{
  process.env.ZENOS_COMMERCE_CDN_ORIGIN=origin;
  globalThis.fetch=async()=>upstream(null,404);
  const r=res();await handler({method:'GET',query:{slug:'loja-teste'}},r);
  assert.equal(r.code,404);
});
test('rejeita catálogo que não corresponde ao apelido',async()=>{
  process.env.ZENOS_COMMERCE_CDN_ORIGIN=origin;
  globalThis.fetch=async()=>upstream({...data,config:{slug:'outra-loja'}});
  const r=res();await handler({method:'GET',query:{slug:'loja-teste'}},r);
  assert.equal(r.code,503);
});
