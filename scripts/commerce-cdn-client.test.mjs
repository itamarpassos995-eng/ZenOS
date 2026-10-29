import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizarApelidoPublico,validarSnapshotPublico,carregarCatalogoPublico} from '../src/core/commerceCdnClient.js';
const snap={versao:1,lojaId:'cliente-zenos-123',config:{
  slug:'loja-teste',nomeLoja:'Loja teste',mostrarPreco:true,whatsapp:'556799999999'},
  produtos:[{id:'a',nome:'Produto 1',precoBRL:50,estoque:2}]};
const response=(obj,status=200)=>({
  ok:status>=200&&status<300,status,headers:{get:()=>null},text:async()=>JSON.stringify(obj)
});
test('não aceita path traversal nem apelidos ambíguos',()=>{
  for(const s of ['../x','ab/cd','a--b','a?x=1','/loja/x','á',null])
    assert.throws(()=>normalizarApelidoPublico(s),/apelido-invalido/);
  assert.equal(normalizarApelidoPublico(' LoJa-TeSte '),'loja-teste');
});
test('consulta somente endpoint público sem credentials, sem Auth e sem Firestore',async()=>{
  let called;
  const result=await carregarCatalogoPublico('LoJa-TeStE',{fetchImpl:async(url,options)=>{
    called={url,options};return response(snap);
  }});
  assert.equal(called.url,'/api/commerce/catalogo?slug=loja-teste');
  assert.equal(called.options.credentials,'omit');
  assert.equal(result.idPublico,'cliente-zenos-123');
  assert.equal(result.configCommerce.nomeLoja,'Loja teste');
  assert.deepEqual(result.produtos,snap.produtos);
});
test('recusa dados inconsistentes ou catálogo de outra loja',()=>{
  assert.throws(()=>validarSnapshotPublico({...snap,config:{...snap.config,slug:'loja-vizinha'}},'loja-teste'),/apelido-nao-corresponde/);
  assert.throws(()=>validarSnapshotPublico({...snap,produtos:[snap.produtos[0],snap.produtos[0]]},'loja-teste'),/produto-duplicado/);
  assert.throws(()=>validarSnapshotPublico({...snap,produtos:[{id:'a',nome:'Produto',precoBRL:-1}]},'loja-teste'),/preco-invalido/);
});
test('catálogo ausente não consulta Firestore como fallback',async()=>{
  let calls=0;
  await assert.rejects(carregarCatalogoPublico('loja-teste',{fetchImpl:async()=>{calls++;return response(null,404);}}),/loja-nao-publicada/);
  assert.equal(calls,1);
});
test('impõe limite de 2 MB e falha fechada',async()=>{
  await assert.rejects(carregarCatalogoPublico('loja-teste',{fetchImpl:async()=>({
    ok:true,headers:{get:()=>String(3_000_000)},text:async()=>{throw Error('não pode ser lido');}
  })}),/catalogo-grande-demais/);
});
