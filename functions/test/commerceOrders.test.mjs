import {test} from 'node:test';import assert from 'node:assert/strict';
import {validarCatalogoPublicavel,catalogoCommerceServidor,validarPedidoCommerce,chavePedidoCommerce,assinaturaPedidoCommerce,telefoneCommerce,respostaPedidoCommerce} from '../src/commerceOrdersCore.js';
const produtos=[{id:'P1',sku:'SKU1',nome:'Produto',preco1BRL:12.5,estoque:10,estoqueGalpao:8,custo:1,fornecedor:'SEGREDO',imagem:'data:image/png;base64,PRIVADO'}];
const regras={P1:{publicado:true,fonteEstoque:'deposito',reservaMinima:2,limiteOnline:4}};
const entrada={nome:'Cliente Teste',telefone:'+55 (67) 99999-1234',aceiteContato:true,itens:[{skuPublico:'SKU1',quantidade:2,preco:0.01}],observacao:'Retirada'};
test('catálogo allowlist, limites e preços canônicos',()=>{
 const c=catalogoCommerceServidor(produtos,regras);assert.equal(c[0].precoCentavos,1250);assert.equal(c[0].quantidadeMaxima,4);
 assert.ok(!JSON.stringify(c).includes('SEGREDO'));assert.ok(!JSON.stringify(c).includes('PRIVADO'));assert.ok(!('custo' in c[0]));
 assert.deepEqual(catalogoCommerceServidor(produtos,{}),[]);
 assert.equal(catalogoCommerceServidor([{...produtos[0],estoque:1}],regras)[0].quantidadeMaxima,0);
 assert.deepEqual(catalogoCommerceServidor([{...produtos[0],preco1BRL:NaN}],regras),[]);
 assert.equal(catalogoCommerceServidor([produtos[0],{...produtos[0],id:'P2'}],{...regras,P2:regras.P1}).length,1);
});
test('pedido agrega duplicados, recusa excesso e ignora preços do navegador',()=>{
 const c=catalogoCommerceServidor(produtos,regras),p=validarPedidoCommerce(entrada,c);assert.equal(p.totalCentavos,2500);assert.equal(p.estoqueReservado,false);assert.equal(p.pagamento,'a_combinar');
 assert.throws(()=>validarPedidoCommerce({...entrada,itens:[...entrada.itens,...entrada.itens,{skuPublico:'SKU1',quantidade:1}]},c),/quantidade/);
 for(const itens of [[],[{skuPublico:'OUTRA-LOJA',quantidade:1}],[{skuPublico:'SKU1',quantidade:1.5}]])assert.throws(()=>validarPedidoCommerce({...entrada,itens},c));
 assert.throws(()=>validarPedidoCommerce({...entrada,aceiteContato:false},c));
 const r=respostaPedidoCommerce(p,'abcdef1234567890','5567999991234');assert.match(r.whatsappUrl,/^https:\/\/wa.me\/5567999991234\?text=/);assert.equal(r.totalCentavos,2500);
});
test('idempotência é isolada por comprador e telefone exige país',()=>{
 const key='envio-1234567890123456';assert.equal(chavePedidoCommerce('A',key),chavePedidoCommerce('A',key));assert.notEqual(chavePedidoCommerce('A',key),chavePedidoCommerce('B',key));assert.throws(()=>chavePedidoCommerce('A','../x'));
 assert.equal(telefoneCommerce('+595 981 732 513'),'595981732513');assert.throws(()=>telefoneCommerce('javascript:foo'));
});

test('publicação rejeita catálogo vazio e foto original pendente',()=>{
 assert.throws(()=>validarCatalogoPublicavel(produtos,{}),/Selecione/);
 assert.throws(()=>validarCatalogoPublicavel(produtos,regras),/foto original/);
 assert.equal(validarCatalogoPublicavel(produtos,{P1:{...regras.P1,usarFotoCadastro:false}}).length,1);
 assert.equal(validarCatalogoPublicavel(produtos,{P1:{...regras.P1,fotoCadastroStoragePath:'caminho-validado-anteriormente'}}).length,1);
});

test('cadastro opcional nao altera pedido e promocoes exigem escolha separada',()=>{
 const c=catalogoCommerceServidor(produtos,regras);
 const normal=validarPedidoCommerce(entrada,c);
 assert.equal(normal.cadastroSolicitado,false);
 assert.equal(normal.aceitePromocoes,false);
 const cadastrado=validarPedidoCommerce({...entrada,criarCadastro:true},c);
 assert.equal(cadastrado.cadastroSolicitado,true);
 assert.equal(cadastrado.aceitePromocoes,false);
 const promo=validarPedidoCommerce({...entrada,criarCadastro:true,aceitePromocoes:true},c);
 assert.equal(promo.aceitePromocoes,true);
 assert.throws(()=>validarPedidoCommerce({...entrada,aceitePromocoes:true},c));
 assert.throws(()=>validarPedidoCommerce({...entrada,criarCadastro:'sim'},c));
 assert.notEqual(assinaturaPedidoCommerce({...entrada,criarCadastro:true}),assinaturaPedidoCommerce({...entrada,criarCadastro:true,aceitePromocoes:true}));
});
