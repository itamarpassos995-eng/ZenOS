import test from 'node:test';import assert from 'node:assert/strict';
import {avaliarPagamentoExistente as avaliar} from '../../src/core/expensePaymentReconcile.js';
const gasto={id:'d1',status:'pendente',valorBRL:100};
const livro={id:'DESPESA-d1',referenciaId:'d1',valor:100,tipo:'pagamento_despesa',origem:'despesas',afetaCaixaFisico:true,sessaoId:'cx1',createdAt:'2026-10-20T20:00:00Z'};
const movimento={id:'MOV-DESP-d1',sessaoId:'cx1',despesaId:'d1',tipo:'saida_despesa',direcao:'saida',afetaGaveta:true,valorBRL:100};
test('com duas provas do servidor, pagamento já existe e deve apenas atualizar status',()=>{
 assert.deepEqual(avaliar({despesa:gasto,lancamento:livro,movimentos:[movimento]}),
 {status:'verified',cash:true,createdAt:livro.createdAt});
});
test('sem movimento, movimento duplicado, valor divergente e outra sessão: bloquear',()=>{
 for(const docs of [
  [],[movimento,movimento],[{...movimento,valorBRL:300}],[{...movimento,sessaoId:'cx2'}]
 ])assert.notEqual(avaliar({despesa:gasto,lancamento:livro,movimentos:docs}).status,'verified');
});
test('lançamento com origem trocada ou valor distinto jamais reconcilia',()=>{
 for(const patch of [{valor:30},{origem:'venda'},{tipo:'venda'},{referenciaId:'outro'}])
  assert.notEqual(avaliar({despesa:gasto,lancamento:{...livro,...patch},movimentos:[movimento]}).status,'verified');
});
test('pagamento não dinheiro exige identidade do livro, sem movimento de gaveta',()=>{
 const livroPix={...livro,afetaCaixaFisico:false,formaPagamento:'pix',sessaoId:null};
 assert.equal(avaliar({despesa:gasto,lancamento:livroPix,movimentos:[]}).status,'verified');
});
