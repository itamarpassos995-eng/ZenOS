import test from 'node:test';
import assert from 'node:assert/strict';
import {apurarTotalContratualPDV,cotarRecebimentoPDV} from '../src/core/pdvNativeCheckout.js';
const itens=[{id:'a',qtd:'2',precoOrigemPDV:{moeda:'PYG',valor:12500},precoPraticadoBRL:10.87}];
const quote=(contrato,moedaRecebimento,PYG)=>cotarRecebimentoPDV({contrato,moedaRecebimento,taxasConfirmadas:{PYG}});
test('trocar moeda a receber não muda contrato Gs. 25.000',()=>{
 const contrato=apurarTotalContratualPDV({itens,moedaPadrao:'PYG'});
 assert.equal(contrato.totalOriginal,25000);
 assert.equal(quote(contrato,'PYG',1150).valorReceber,25000);
 assert.equal(quote(contrato,'PYG',1100).valorReceber,25000);
 assert.equal(quote(contrato,'BRL',1150).valorReceber,21.74);
 assert.equal(quote(contrato,'BRL',1100).valorReceber,22.73);
 assert.equal(contrato.totalOriginal,25000);
});
test('desconto da loja é nominal, não recalculado ao mudar câmbio',()=>{
 const contrato=apurarTotalContratualPDV({itens,moedaPadrao:'PYG',desconto:'5000'});
 assert.equal(contrato.totalOriginal,20000);
 assert.equal(quote(contrato,'PYG',1100).valorReceber,20000);
 assert.equal(quote(contrato,'BRL',1000).valorReceber,20);
});
test('novo ou antigo cliente com preço comprovado obedece a mesma regra',()=>{
 for(const id of ['cliente-novo','cliente-antigo']){
 const contrato=apurarTotalContratualPDV({itens:itens.map(x=>({...x,id})),moedaPadrao:'PYG'});
 assert.equal(contrato.totalOriginal,25000);
 }
});
test('item legado sem moeda comprovada não recebe uma conversão inventada',()=>{
 const r=apurarTotalContratualPDV({itens:[{id:'legado',qtd:'1',precoPraticadoBRL:21.74}],moedaPadrao:'PYG'});
 assert.deepEqual(r,{ok:false,motivo:'ITEM_SEM_PRECO_NATIVO_COMPROVADO',itemId:'legado'});
 assert.equal(cotarRecebimentoPDV({contrato:r,moedaRecebimento:'BRL',taxasConfirmadas:{PYG:1150}}).ok,false);
});
test('não altera nem corrige preço de item original, mesmo com rate novos',()=>{
 const antes=JSON.stringify(itens);
 const c=apurarTotalContratualPDV({itens,moedaPadrao:'PYG'});
 quote(c,'USD',1100);
 assert.equal(JSON.stringify(itens),antes);
});
test('cotação obrigatória apenas para moedas distintas',()=>{
 const c=apurarTotalContratualPDV({itens,moedaPadrao:'PYG'});
 assert.equal(cotarRecebimentoPDV({contrato:c,moedaRecebimento:'PYG'}).valorReceber,25000);
 assert.equal(cotarRecebimentoPDV({contrato:c,moedaRecebimento:'BRL',taxasConfirmadas:{}}).ok,false);
});
