import test from 'node:test';import assert from 'node:assert/strict';
import {calcularDespesasPagasResultado as total} from '../../src/core/expenseResult.js';
test('somente pagas ativas ou arquivadas com efeito preservado entram no resultado',()=>{
 const base=[{status:'paga',valorBRL:100},{status:'excluida',financeiroMantido:true,valorBRL:40},
 {status:'excluida',financeiroMantido:false,valorBRL:30},{status:'pendente',valorBRL:20},
 {status:'paga',naturezaContabil:'estoque_ativo',valorBRL:55},
 {status:'paga',afetaResultado:false,valorBRL:70}];
 assert.equal(total(base),140);
 assert.equal(total([]),0);
});
