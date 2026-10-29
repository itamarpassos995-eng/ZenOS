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

test('cliente carrega 1200 produtos em 15 lotes sem Firestore',async()=>{
 const todos=Array.from({length:1200},(_,i)=>({id:'p'+i,nome:'Produto '+i,precoBRL:30,estoque:1}));
 const meta={versao:2,lojaId:'loja-123',publicacaoId:'abc12345-001',
   totalProdutos:1200,totalPaginas:15,publicadoEm:'2026-10-29T00:00:00Z',
   config:{slug:'loja-teste',nomeLoja:'Loja Teste',produtosLoja:{}}};
 const requests=[];
 const fetchImpl=async(url,options)=>{
   requests.push({url,credentials:options.credentials});
   const numero=Number(new URL(url,'https://zenos.app.br').searchParams.get('pagina')||0);
   if(!numero)return response(meta);
   const lotes=todos.slice((numero-1)*80,numero*80);
   return response({versao:2,lojaId:'loja-123',slug:'loja-teste',
     publicacaoId:meta.publicacaoId,pagina:numero,produtos:lotes,
     produtosLoja:Object.fromEntries(lotes.map(p=>[p.id,{ativo:true}]))});
 };
 const data=await carregarCatalogoPublico('loja-teste',{fetchImpl});
 assert.equal(data.produtos.length,1200);
 assert.equal(data.produtos.at(-1).id,'p1199');
 assert.equal(Object.keys(data.configCommerce.produtosLoja).length,1200);
 assert.equal(requests.length,16);
 assert.ok(requests.every(r=>r.credentials==='omit'));
});
test('lote incompleto falha sem apresentar catálogo parcial',async()=>{
 const m={versao:2,lojaId:'loja-123',publicacaoId:'abc12345-001',totalProdutos:80,totalPaginas:1,
   config:{slug:'loja-teste',nomeLoja:'Loja Teste'}};
 await assert.rejects(carregarCatalogoPublico('loja-teste',{
   fetchImpl:async url=>url.includes('pagina=')
     ?response({versao:2,lojaId:'loja-123',slug:'loja-teste',publicacaoId:m.publicacaoId,
       pagina:1,produtos:[],produtosLoja:{}}):response(m)
 }),/catalogo-incompleto/);
});
