import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarRascunhoCommerce} from '../src/commerceStudioCore.js';
import {catalogoCommerceServidor,validarPedidoCommerce} from '../src/commerceOrdersCore.js';
import {normalizarRegraPublicacao,projetarCatalogoPublico} from '../../src/core/commerceCatalog.js';

const produto={id:'P1',sku:'SKU-1',nome:'Water Plus',precoBRL:169.9,estoque:9,estoqueVitrine:4,estoqueGalpao:5,custoBRL:80,fornecedor:'PRIVADO',imagem:''};
const configuracao={publicado:true,fonteEstoque:'vitrine',reservaMinima:1,limiteOnline:3,precoOnlineBRL:144.9,precoAnteriorBRL:169.9,descricaoWeb:'Tintura especial da vitrine digital',usarFotoCadastro:false};

test('commerce produto: rascunho privado isolado e sem mutação de produto operacional',()=>{
 const anterior=structuredClone(produto);
 const salvos=validarRascunhoCommerce({aparencia:{banners:[]},regras:{P1:configuracao}},'loja-de-teste');
 assert.equal(salvos.regras.P1.descricaoWeb,configuracao.descricaoWeb);
 assert.equal(salvos.regras.P1.precoAnteriorBRL,169.9);
 assert.equal(salvos.regras.P1.precoOnlineBRL,144.9);
 assert.deepEqual(produto,anterior);
 const regra=normalizarRegraPublicacao(salvos.regras.P1);
 const vitrine=projetarCatalogoPublico({produtos:[produto],regras:{P1:regra},lojaAtivada:true,modoPrevia:true});
 assert.equal(vitrine[0].descricao,configuracao.descricaoWeb);
 assert.equal(vitrine[0].precoAnteriorBRL,169.9);
 assert.equal(vitrine[0].precoBRL,144.9);
 assert.equal(vitrine[0].quantidadeMaxima,3);
 assert.ok(!JSON.stringify(vitrine).includes('PRIVADO'));
});

test('commerce produto: checkout usa apenas preço canônico e estoque, não antigo preço de oferta',()=>{
 const regras={P1:validarRascunhoCommerce({aparencia:{banners:[]},regras:{P1:configuracao}},'loja-de-teste').regras.P1};
 const itens=catalogoCommerceServidor([produto],regras);
 assert.equal(itens[0].precoCentavos,14490);
 assert.equal(itens[0].quantidadeMaxima,3);
 const pedido=validarPedidoCommerce({nome:'Cliente Teste',telefone:'+5567999991111',aceiteContato:true,itens:[{skuPublico:'SKU-1',quantidade:2}]},itens);
 assert.equal(pedido.totalCentavos,28980);
 assert.throws(()=>validarPedidoCommerce({nome:'Cliente Teste',telefone:'+5567999991111',aceiteContato:true,itens:[{skuPublico:'SKU-1',quantidade:4}]},itens),/quantidade/);
});

test('commerce produto: preço anterior não cria desconto falso e descrição tem limite',()=>{
 const desc='a'.repeat(900);
 const r=validarRascunhoCommerce({aparencia:{banners:[]},regras:{P1:{...configuracao,precoAnteriorBRL:120,descricaoWeb:desc}}},'loja-de-teste').regras.P1;
 assert.equal(r.descricaoWeb.length,800);
 const prev=projetarCatalogoPublico({produtos:[produto],regras:{P1:r},lojaAtivada:true});
 assert.equal(prev[0].precoAnteriorBRL,null);
 assert.throws(()=>validarRascunhoCommerce({aparencia:{banners:[]},regras:{P1:{...configuracao,precoAnteriorBRL:-1}}},'loja-de-teste'),/Preço online inválido/);
});