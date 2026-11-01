import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validarComposicaoPagamento } from '../src/core/paymentValidation.js';
import { interpretarValorMonetario, converterValoresFisicosParaBRL } from '../src/core/cashMoneyInput.js';
import { calcularResumoSessao, assinaturaFinanceiraSessao } from '../src/core/cashSession.js';
import { calcularConciliacaoFisicaMultimoeda } from '../src/core/cashReconciliation.js';

const parse = (text, currency) => interpretarValorMonetario(text, currency);
assert.equal(parse('30.000', 'PYG').valor, 30000);
assert.equal(parse('30,000', 'PYG').valor, 30000);
assert.equal(parse('1.470,20', 'BRL').valor, 1470.2);
assert.equal(parse('1,470.20', 'BRL').valor, 1470.2);
assert.equal(parse('1.470.20', 'BRL').ok, false);
assert.equal(parse('1.470,200', 'BRL').ok, false);
assert.equal(parse('abc', 'BRL').ok, false);
assert.equal(parse('-50', 'BRL').ok, false);
assert.equal(parse('', 'BRL').ok, false);
assert.equal(interpretarValorMonetario('', 'BRL', { permitirVazio: true }).valor, 0);
assert.equal(parse('30,20', 'PYG').ok, false);
assert.equal(parse('30000', 'PYG').valor, 30000);
const total = converterValoresFisicosParaBRL({ BRL: '1.470,20', PYG:'30.000' }, { USD: 0.185, EUR: 0.165, PYG: 1500 });
assert.equal(total.ok, true);
assert.equal(total.totalBRL, 1490.2);
assert.equal(total.valoresNativos.PYG, 30000);
assert.equal(converterValoresFisicosParaBRL({ PYG:'abc' }, { PYG: 1500 }).ok, false);
const sessao = { id: 'SESSAO-2', operadorId: 'OP-1', createdAt:'2026-10-09T10:00:00.000Z', status:'fechada', fechamento:'2026-10-09T17:00:00.000Z', saldoInicial:0 };
const vendas = [
  { id:'new', estado:'concluida', sessaoId:'SESSAO-2', vendedorId:'OP-1', createdAt:'2026-10-09T10:10:00.000Z', pagamentos:[{formaId:'dinheiro_brl',valorConvertidoBRL:100}] },
  { id:'other', estado:'concluida', sessaoId:'SESSAO-3', vendedorId:'OP-1', createdAt:'2026-10-09T11:00:00.000Z', pagamentos:[{formaId:'dinheiro_brl',valorConvertidoBRL:500}] },
  { id:'old', estado:'concluida', vendedorId:'OP-1', createdAt:'2026-10-09T10:30:00.000Z', pagamentos:[{formaId:'dinheiro_brl',valorConvertidoBRL:20}] },
  { id:'late', estado:'concluida', vendedorId:'OP-1', createdAt:'2026-10-09T18:00:00.000Z', pagamentos:[{formaId:'dinheiro_brl',valorConvertidoBRL:999}] },
];
assert.equal(calcularResumoSessao({sessao,historicoVendas:vendas,caixaMovimentos:[]}).vendasDinheiro,120);
assert.equal(validarComposicaoPagamento({totalBRL:100,recebidoBRL:120,recebidoDinheiroBRL:0}).podeConcluir,false);
assert.equal(validarComposicaoPagamento({totalBRL:100,recebidoBRL:120,recebidoDinheiroBRL:50}).podeConcluir,true);
assert.equal(validarComposicaoPagamento({totalBRL:100,recebidoBRL:100,recebidoDinheiroBRL:0}).podeConcluir,true);
assert.equal(validarComposicaoPagamento({totalBRL:100,recebidoBRL:0,recebidoDinheiroBRL:0}).podeConcluir,false);
assert.equal(validarComposicaoPagamento({totalBRL:100,recebidoBRL:Number.NaN,recebidoDinheiroBRL:0}).podeConcluir,false);
// Garante que os pontos críticos da interface importem os motores efetivamente exercitados.
const pdv=fs.readFileSync(new URL('../src/components/PDV.jsx',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
assert.match(pdv,/import \{ validarComposicaoPagamento \} from '..\/core\/paymentValidation'/);
assert.match(pdv,/const \{ podeConcluir: podeFinalizarVenda, trocoBRL: trocoCalculadoBRL \} = validarComposicaoPagamento/);
assert.match(pdv,/sessaoId: tipoFinalizacao === 'venda' \? sessaoAtiva\?\.id/);
assert.match(app,/converterValoresFisicosParaBRL\(valoresMovCaixa, taxasCambio\)/);
assert.match(app,/const contagemValidada = validarValoresMovCaixa\(\)/);


const cenarioBase = {
  id:'SESSAO-990', operadorId:'op-99', createdAt:'2026-10-15T10:00:00.000Z',
  status:'aberta', saldoInicial:100, detalheAberturaNativos:{BRL:100,USD:0,EUR:0,PYG:0},
  taxasCambioAbertura:{BRL:1,USD:0.2,EUR:0.18,PYG:1380},
};
const historicoNativo = [{
  id:'venda-1', estado:'concluida', vendedorId:'op-99', sessaoId:'SESSAO-990', createdAt:'2026-10-15T11:00:00.000Z',
  pagamentos:[{formaId:'dinheiro_pyg',moedaOrigem:'PYG',valorOriginal:20120,valorConvertidoBRL:14.58}],
  trocoBRL:0,
}];
const contar = (taxas, contagem) => calcularConciliacaoFisicaMultimoeda({
  sessao:cenarioBase, historicoVendas:historicoNativo, caixaMovimentos:[],
  contagem, taxas,
});
const baseFx=contar({BRL:1,USD:0.2,EUR:0.18,PYG:1380},{BRL:100,PYG:20120});
const novoFx=contar({BRL:1,USD:0.2,EUR:0.18,PYG:1200},{BRL:100,PYG:20120});
assert.equal(baseFx.confiavel,true);
assert.equal(novoFx.confiavel,true);
assert.equal(baseFx.divergenciaFisica,false);
assert.equal(novoFx.divergenciaFisica,false);
assert.equal(novoFx.diferencaBRL,0);
assert.notEqual(baseFx.totalEsperadoBRL,novoFx.totalEsperadoBRL,'BRL reavaliado altera total mas não cria falta');
assert.equal(contar({BRL:1,USD:0.2,EUR:0.18,PYG:1200},{BRL:100,PYG:20000}).divergenciaFisica,true);
const legada = [{...historicoNativo[0],id:'legada',pagamentos:[{formaId:'dinheiro_pyg',valorConvertidoBRL:14.58}]}];
const incompleta = calcularConciliacaoFisicaMultimoeda({
  sessao:cenarioBase,historicoVendas:legada,caixaMovimentos:[],
  contagem:{BRL:100,PYG:20120},taxas:{BRL:1,USD:0.2,EUR:0.18,PYG:1380},
});
assert.equal(incompleta.confiavel,false,'origem ausente não pode imputar falta');
assert.ok(incompleta.pendencias.length > 0);
const moedaTroco = calcularConciliacaoFisicaMultimoeda({
  sessao:cenarioBase,
  historicoVendas:[{...historicoNativo[0],pagamentos:[{formaId:'dinheiro_usd',moedaOrigem:'USD',valorOriginal:10,valorConvertidoBRL:50}],trocoBRL:10,moedaTrocoInfo:'BRL',trocoOriginal:10}],
  caixaMovimentos:[],contagem:{BRL:90,USD:10},taxas:{BRL:1,USD:0.2,EUR:0.18,PYG:1380},
});
assert.equal(moedaTroco.confiavel,true);
assert.equal(moedaTroco.divergenciaFisica,false);
const assinatura1=assinaturaFinanceiraSessao({sessao:cenarioBase,historicoVendas:historicoNativo,caixaMovimentos:[]});
const assinatura2=assinaturaFinanceiraSessao({sessao:cenarioBase,historicoVendas:[{...historicoNativo[0],pagamentos:[{...historicoNativo[0].pagamentos[0],valorOriginal:20121}]}],caixaMovimentos:[]});
assert.notEqual(assinatura1,assinatura2,'venda alterada durante fechamento precisa abortar');
const assinatura3=assinaturaFinanceiraSessao({sessao:cenarioBase,historicoVendas:historicoNativo,caixaMovimentos:[{id:'MOV-1',sessaoId:cenarioBase.id,tipo:'sangria',valorBRL:10}]});
assert.notEqual(assinatura1,assinatura3,'sangria concorrente precisa abortar');
const sync=fs.readFileSync(new URL('../src/core/productionSync.js',import.meta.url),'utf8');
assert.match(sync,/cash_close_snapshot_matches/);
assert.match(sync,/cash_close_exchange_rates_match/);
assert.match(app,/situacaoConciliacao/);
assert.match(app,/assinaturaFinanceiraSessao/);
assert.match(app,/PENDENTE_AUDITORIA/);
assert.match(app,/CONCILIAÇÃO FÍSICA POR MOEDA/);


// Regressão: um centavo exato não pode ser descartado por comparação de ponto flutuante.
assert.equal(validarComposicaoPagamento({
  totalBRL:100.01, recebidoBRL:100.02, recebidoDinheiroBRL:100.02,
}).trocoBRL,0.01);
assert.equal(validarComposicaoPagamento({
  totalBRL:100, recebidoBRL:99.99, recebidoDinheiroBRL:99.99,
}).podeConcluir,false);
// Um pagamento legado sem identificador não pode ser ignorado e resultar em "conciliado".
const vendaFormaLegada = [{
  ...historicoNativo[0], id:'mesa-antiga',
  pagamentos:[{rotulo:'Dinheiro (R$)',valorConvertidoBRL:40}],
}];
const conciliacaoLegada = calcularConciliacaoFisicaMultimoeda({
  sessao:cenarioBase, historicoVendas:vendaFormaLegada, caixaMovimentos:[],
  contagem:{BRL:140}, taxas:{BRL:1,USD:0.2,EUR:0.18,PYG:1380},
});
assert.equal(conciliacaoLegada.confiavel,false);
assert.ok(conciliacaoLegada.pendencias.some(p=>p.includes('sem forma identificável')));

// Regressão real de loja BR/PY: 300 reais e 40.000 guaranis são gavetas
// independentes; o câmbio altera somente o equivalente de apresentação.
const sessaoMista = {
  id:'SESSAO-MISTA', operadorId:'op-mista', createdAt:'2026-11-01T10:00:00.000Z',
  status:'aberta', saldoInicial:0,
  detalheAberturaNativos:{BRL:0,USD:0,EUR:0,PYG:0},
};
const vendaMista = {
  id:'VENDA-MISTA',estado:'concluida',sessaoId:'SESSAO-MISTA',
  createdAt:'2026-11-01T11:00:00.000Z',
  pagamentos:[
    {formaId:'dinheiro_brl',moedaOrigem:'BRL',valorOriginal:300,valorConvertidoBRL:300},
    {formaId:'dinheiro_pyg',moedaOrigem:'PYG',valorOriginal:40000,valorConvertidoBRL:33.33},
  ],trocoBRL:0,
};
const mista = (venda,contagem,cambio=1200) => calcularConciliacaoFisicaMultimoeda({
  sessao:sessaoMista,historicoVendas:[venda],caixaMovimentos:[],
  contagem,taxas:{BRL:1,USD:0.2,EUR:0.18,PYG:cambio},
});
const semTroco=mista(vendaMista,{BRL:300,PYG:40000});
assert.equal(semTroco.confiavel,true);
assert.equal(semTroco.divergenciaFisica,false);
assert.deepEqual([semTroco.esperado.BRL,semTroco.esperado.PYG],[300,40000]);
assert.equal(semTroco.totalEsperadoBRL,333.33);
const trocoGuarani={...vendaMista,trocoBRL:8.33,moedaTrocoInfo:'PYG',trocoOriginal:10000};
const comTroco=mista(trocoGuarani,{BRL:300,PYG:30000});
assert.equal(comTroco.confiavel,true);
assert.equal(comTroco.divergenciaFisica,false);
assert.equal(comTroco.esperado.BRL,300);
assert.equal(comTroco.esperado.PYG,30000);
assert.equal(comTroco.totalEsperadoBRL,325);
const novaCotacao=mista(trocoGuarani,{BRL:300,PYG:30000},1000);
assert.equal(novaCotacao.divergenciaFisica,false);
assert.equal(novaCotacao.esperado.PYG,30000);
assert.equal(novaCotacao.totalEsperadoBRL,330);
assert.equal(converterValoresFisicosParaBRL({BRL:'300,00',PYG:'40.000'},{PYG:1200}).totalBRL,333.33);
// O total visível do fechamento deve respeitar a moeda escolhida.
assert.match(app,/const moedaTotalCaixa =/);
assert.match(app,/fmt\(calcularTotalMovBRL\(\), moedaTotalCaixa\)/);
assert.doesNotMatch(app,/TOTAL FÍSICO INFORMADO • CONVERTIDO PARA BRL/);

// Movimentos antigos em moeda estrangeira sem quantia física não podem
// ser reinterpretados como reais e produzir conciliação falsa.
const movimentoSemNativo=calcularConciliacaoFisicaMultimoeda({
  sessao:sessaoMista,historicoVendas:[],
  caixaMovimentos:[{id:'MOV-PYG-ANTIGO',sessaoId:sessaoMista.id,tipo:'suprimento',moedaOrigem:'PYG',valorBRL:33.33}],
  contagem:{BRL:0,PYG:40000},taxas:{BRL:1,USD:0.2,EUR:0.18,PYG:1200},
});
assert.equal(movimentoSemNativo.confiavel,false);
assert.equal(movimentoSemNativo.esperado.BRL,0);
assert.ok(movimentoSemNativo.pendencias.some(p=>p.includes('faltam valores físicos nativos')));
assert.match(app,/fmt\(saldoEsperadoBRL, moedaTotalCaixa\)/);
assert.match(app,/fmt\(valInformadoBRL, moedaTotalCaixa\)/);

// O diálogo final não deve reduzir os saldos nativos a três valores só em BRL.
assert.match(app,/Demonstrativo físico por moeda:/);
assert.match(app,/conciliacaoFisica\.esperado\?\.\[m\]/);
assert.match(app,/conciliacaoFisica\.contado\?\.\[m\]/);
assert.match(app,/conciliacaoFisica\.diferencas\?\.\[m\]/);
assert.match(app,/Equivalente total esperado em BRL/);
assert.doesNotMatch(app,/detalhes:\s*\[\s*`Saldo esperado:/);
console.log('ZenOS caixa: testes de regressão P0 aprovados.');
