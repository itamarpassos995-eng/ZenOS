import test from 'node:test';
import assert from 'node:assert/strict';
import {criarSnapshotCommercePublico,conferirCarrinhoContraSnapshot,dividirCatalogoPublico,COMMERCE_MAX_PRODUTOS} from '../src/core/commercePublicCatalog.js';
const lojaId='uid-zenos-teste';
const config={nomeLoja:'Loja Teste',slug:'loja-teste',habilitado:true,
  whatsapp:'556799999999',descontoGeralPorcentagem:10,
  chavePix:'pix-publica@example.com',senha:'SEGREDO-NAO-PUBLICAR',
  clientes:[{cpf:'00000000000'}],saldo:5000,
  produtosLoja:{'p-1':{ativo:true,precoPromoBRL:35,
    imagensLoja:['https://exemplo.com/a.jpg','javascript:alert(1)']}}};
const produtos=[{id:'p-1',nome:'Tinta',preco:50,estoque:4,custo:20,fornecedor:'interno',grupo:'Tintas'},
  {id:'p-2',nome:'Sem estoque',preco:10,estoque:0}];
const criar=(c=config,p=produtos)=>criarSnapshotCommercePublico({lojaId,config:c,produtos:p,publicadoEm:'2026-10-29T00:00:00Z'});
test('não publica dados privados de gestão',()=>{
  const output=JSON.stringify(criar());
  for(const privado of ['SEGREDO-NAO-PUBLICAR','00000000000','fornecedor','custo','saldo','clientes'])
    assert.ok(!output.includes(privado),privado);
});
test('preserva somente dados públicos',()=>{
  const s=criar();
  assert.equal(s.config.whatsapp,config.whatsapp);
  assert.equal(s.config.chavePix,config.chavePix);
  assert.deepEqual(s.produtos.map(p=>p.id),['p-1']);
  assert.deepEqual(s.config.produtosLoja['p-1'].imagensLoja,['https://exemplo.com/a.jpg']);
});
test('loja desativada não publica produtos',()=>assert.deepEqual(criar({...config,habilitado:false}).produtos,[]));
test('bloqueia identificador inválido',()=>assert.throws(
  ()=>criarSnapshotCommercePublico({lojaId:'../x',config,produtos}),/loja-id-invalido/));
test('catálogo com 1200 produtos não perde itens e é dividido em lotes',()=>{
  const p=Array.from({length:1200},(_,i)=>({id:'produto-'+i,nome:'Produto '+i,preco:1,estoque:3}));
  const snapshot=criar(config,p);
  assert.equal(snapshot.produtos.length,1200);
  const {manifesto,paginas}=dividirCatalogoPublico(snapshot,'abc12345-001');
  assert.equal(manifesto.versao,2);
  assert.equal(manifesto.totalProdutos,1200);
  assert.equal(manifesto.totalPaginas,15);
  assert.equal(paginas.length,15);
  assert.equal(paginas.flatMap(x=>x.produtos).length,1200);
  assert.equal(paginas.at(-1).produtos.at(-1).id,'produto-1199');
  assert.deepEqual(manifesto.config.produtosLoja,{});
});
test('rejeita catálogos acima do limite de segurança sem truncar silenciosamente',()=>{
  const many=Array.from({length:COMMERCE_MAX_PRODUTOS+1},(_,i)=>({id:String(i),nome:'Produto',preco:1,estoque:3}));
  assert.throws(()=>criar(config,many),/produtos-invalidos/);
});
test('recálculo não confia em preço fornecido pelo navegador',()=>{
  assert.equal(conferirCarrinhoContraSnapshot(criar(),[{id:'p-1',quantidade:2,preco:0.01}]).totalCentavos,7000);
});
test('rejeita itens inexistentes, repetidos, fora do estoque ou loja inativa',()=>{
  const s=criar();
  assert.throws(()=>conferirCarrinhoContraSnapshot(s,[{id:'p-9',quantidade:1}]),/produto-nao-publicado/);
  assert.throws(()=>conferirCarrinhoContraSnapshot(s,[{id:'p-1',quantidade:1},{id:'p-1',quantidade:1}]),/item-duplicado/);
  assert.throws(()=>conferirCarrinhoContraSnapshot(s,[{id:'p-1',quantidade:5}]),/estoque-ou-quantidade-invalida/);
  assert.throws(()=>conferirCarrinhoContraSnapshot(criar({...config,habilitado:false}),[{id:'p-1',quantidade:1}]),/loja-inativa/);
});
