import assert from 'node:assert/strict';
import {projetarHistoricoNovaVendaPDV} from '../src/core/pdvWriteIntent.js';
import {mergeV1FieldThreeWay} from '../src/core/syncMerge.js';

const anterior={id:'DOC-ANTERIOR',estado:'pendente',clienteNome:'Original'};
const base=[anterior];
const atual={id:'VENDA-NOVA',estado:'concluida',totalBRL:110,itens:[{id:'x',qtd:1}]};
const obsoleto={...anterior,estado:'concluida',clienteNome:'Tela com estado diferente'};
const changes=[{field:'historicoVendas',baseValue:base,value:[atual,obsoleto]}];
const projected=projetarHistoricoNovaVendaPDV({...changes[0],operationKey:'pdv:VENDA-NOVA'});
assert.deepEqual(projected,[atual,anterior],'PDV deve carregar apenas inclusão da nova venda, sem mutações antigas');
assert.deepEqual(changes[0].value,[atual,obsoleto],'não alterar arrays da UI');
const merged=mergeV1FieldThreeWay({field:'historicoVendas',baseValue:base,localValue:projected,remoteValue:[]});
assert.deepEqual(merged,[atual],'merge remove tombstone e grava nova venda normalmente');
const outro={id:'NOVA-OUTRO-CAIXA',estado:'concluida'};
const remoto=mergeV1FieldThreeWay({field:'historicoVendas',baseValue:base,localValue:projected,remoteValue:[outro]});
assert.deepEqual(remoto,[atual,outro],'não alterar documento válido do outro caixa');
assert.deepEqual(projetarHistoricoNovaVendaPDV({
 field:'historicoVendas',baseValue:base,value:[atual],operationKey:'pdv:VENDA-NOVA',
}),[atual,anterior],'pré-pedido antigo volta apenas como referência da BASE para remoção guardada');
assert.deepEqual(projetarHistoricoNovaVendaPDV({
 field:'clientes',baseValue:base,value:[atual,obsoleto],operationKey:'pdv:VENDA-NOVA',
}),[atual,obsoleto],'não interferir no cliente/fiado');
assert.deepEqual(projetarHistoricoNovaVendaPDV({
 field:'historicoVendas',baseValue:base,value:[atual,obsoleto],operationKey:'outra-operacao',
}),[atual,obsoleto],'não interferir em devoluções e demais operações');
assert.throws(()=>projetarHistoricoNovaVendaPDV({
 field:'historicoVendas',baseValue:base,value:[obsoleto],operationKey:'pdv:VENDA-NOVA',
}),error=>error.code==='ZENOS_PDV_HISTORY_INTENT','não vender sem documento identificável');
assert.throws(()=>projetarHistoricoNovaVendaPDV({
 field:'historicoVendas',baseValue:base,value:[atual,atual],operationKey:'pdv:VENDA-NOVA',
}),error=>error.code==='ZENOS_PDV_HISTORY_INTENT','não aceitar documento duplicado');
console.log('V2 PDV: só nova venda, histórico antigo preservado, tombstones respeitados, sem mutar devolução — OK');
