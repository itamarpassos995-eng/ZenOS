import test from 'node:test';
import assert from 'node:assert/strict';
import {calcularCarrinhoNativoPDV,registrarPagamentoNativoPDV,validarQuitacaoNativa,registrarBridgeContabilBRL} from '../src/core/nativePdvAccounting.js';
const rates={BRL:'1',PYG:'1500',USD:'0.20',EUR:'0.18'};
test('venda PYG não reprecifica com câmbio atualizado',()=>{
 const item={id:'P',qtd:'2',precoOrigemPDV:{valor:30000,moeda:'PYG'}};
 for(const pyg of ['1500','1200','1100']){
  const c=calcularCarrinhoNativoPDV({itens:[item],desconto:'10000',moedaLoja:'PYG',moedaDesconto:'PYG',taxas:{...rates,PYG:pyg}});
  assert.equal(c.subtotalMinor,'60000');
  assert.equal(c.totalMinor,'50000');
 }
});
test('pagamento misto USD PYG: sem BRL intermediário e sem centavo de guarani',()=>{
 const cart=calcularCarrinhoNativoPDV({itens:[{id:'a',qtd:'1',precoOrigemPDV:{valor:10,moeda:'USD'}}],
  desconto:'0',moedaLoja:'USD',taxas:rates});
 const events=[
  registrarPagamentoNativoPDV({id:'a',formaId:'dinheiro_pyg',moedaRecebida:'PYG',valorRecebido:'37500',moedaLoja:'USD',taxas:rates}),
  registrarPagamentoNativoPDV({id:'b',formaId:'cartaoCredito_usd',moedaRecebida:'USD',valorRecebido:'5.00',moedaLoja:'USD',taxas:rates})
 ];
 assert.equal(cart.totalMinor,'1000');
 assert.equal(validarQuitacaoNativa({totalMinor:cart.totalMinor,pagamentos:events,moedaLoja:'USD'}).podeConcluir,true);
 assert.equal(events[0].receivedMinor,'37500');
 assert.equal(events[0].creditedMinor,'500');
 assert.equal(registrarBridgeContabilBRL('1000','USD',rates),50);
});
test('produto legado sem origem em PYG nunca recebe moeda fictícia',()=>{
 assert.throws(()=>calcularCarrinhoNativoPDV({itens:[{qtd:'1',precoBRL:50}],desconto:'0',
   moedaLoja:'PYG',taxas:rates}),/moeda original comprovada/);
});
test('troco sem lastro de dinheiro rejeitado em USD',()=>{
 const ev=registrarPagamentoNativoPDV({id:'x',formaId:'cartaoCredito',moedaRecebida:'USD',valorRecebido:'20',moedaLoja:'USD',taxas:rates});
 assert.equal(validarQuitacaoNativa({totalMinor:'1000',pagamentos:[ev],moedaLoja:'USD'}).excessoEletronico,true);
});
