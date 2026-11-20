import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {businessOperationChecks} from '../src/core/productionSync.js';

const guard={type:'entity_field_equals',field:'despesas',entityId:'d',entityKey:'id',
 property:'status',expected:'pendente'};
test('pagamento só é liberado para obrigação pendente e identificada',()=>{
 assert.doesNotThrow(()=>businessOperationChecks.assertBusinessGuards({
  despesas:[{id:'d',status:'pendente',valorBRL:25}]
 },[guard]));
 for(const data of [
  {despesas:[{id:'d',status:'paga',valorBRL:25}]},
  {despesas:[]},
  {despesas:[{id:'outra',status:'pendente',valorBRL:25}]}
 ]) assert.throws(()=>businessOperationChecks.assertBusinessGuards(data,[guard]));
});
test('retries do pagamento possuem chave idempotente estável para uma mesma despesa',()=>{
 const expense=readFileSync(new URL('../src/components/Despesas.jsx',import.meta.url),'utf8');
 assert.match(expense,/operationKey:'despesa-pagamento:'\+String\(despesaParaPagar.id\)/);
 assert.match(expense,/property:'status',expected:'pendente'/);
 assert.match(expense,/AJUSTE-CAMBIO-DESPESA/);
 assert.match(expense,/afetaCaixaFisico:false/);
});
test('guard FX é conferida na mesma transação do livro com cotação existente',()=>{
 const source=readFileSync(new URL('../src/core/productionSync.js',import.meta.url),'utf8');
 assert.match(source,/g\?\.type === 'money_exchange_rates_match'/);
 assert.match(source,/!taxasRemotas \|\| !exchangeRateSnapshotsEqual\(taxasRemotas, pagamentoCambio.taxas\)/);
});
