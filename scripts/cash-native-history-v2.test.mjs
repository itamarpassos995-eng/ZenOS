import test from 'node:test';
import assert from 'node:assert/strict';
import { obterComposicaoHistoricaCaixa, formatarDinheiroNativo } from '../src/core/cashHistoryDisplay.js';
import { calcularConciliacaoFisicaMultimoeda } from '../src/core/cashReconciliation.js';
import { converterValoresFisicosParaBRL } from '../src/core/cashMoneyInput.js';

const taxas={BRL:1,USD:0.185185,EUR:0.165289,PYG:1150};
const abertura={BRL:10,USD:10,EUR:10,PYG:10};
const nativos={...abertura};
const convertido=converterValoresFisicosParaBRL(nativos,taxas);
test('abertura e suprimento mantêm 20 unidades nativas de cada moeda',()=>{
 assert.equal(convertido.ok,true);
 const mov={id:'MOV1',sessaoId:'S1',tipo:'suprimento',detalhesMoedasNativas:nativos,taxasCambioMovimento:taxas,valorBRL:convertido.totalBRL};
 const c=calcularConciliacaoFisicaMultimoeda({sessao:{id:'S1',operadorId:'op',createdAt:'2026-11-01T10:00:00Z',detalheAberturaNativos:abertura},historicoVendas:[],caixaMovimentos:[mov],contagem:{BRL:20,USD:20,EUR:20,PYG:20},taxas});
 assert.equal(c.confiavel,true);
 assert.equal(c.divergenciaFisica,false);
 for (const m of ['BRL','USD','EUR','PYG']) assert.equal(c.esperado[m],20);
 assert.equal(obterComposicaoHistoricaCaixa(mov).moedas.length,4);
});
test('historico usa câmbio congelado sem recalcular com cotação atual',()=>{
 const mov={detalhesMoedasNativas:{BRL:10,USD:10,EUR:10,PYG:10},taxasCambioMovimento:taxas,valorBRL:convertido.totalBRL};
 const antes=obterComposicaoHistoricaCaixa(mov);
 const depois=obterComposicaoHistoricaCaixa(mov);
 assert.equal(antes.equivalenteBRL,convertido.totalBRL);
 assert.deepEqual(depois,antes);
 assert.equal(depois.taxas.PYG,1150);
});
test('legado ambíguo não inventa composição física',()=>{
 const a=obterComposicaoHistoricaCaixa({valorBRL:124.51});
 assert.equal(a.comprovada,false);
 assert.equal(a.moedas.length,0);
});
test('rejeita quantidades negativas e PYG fracionário',()=>{
 assert.equal(obterComposicaoHistoricaCaixa({detalhesMoedasNativas:{PYG:10.5}}).comprovada,false);
 assert.equal(obterComposicaoHistoricaCaixa({detalhesMoedasNativas:{USD:-10}}).comprovada,false);
});
test('guarani sem centavos e outros com centavos',()=>{
 assert.match(formatarDinheiroNativo(10000,'PYG','pt'),/PYG 10\.000/);
 assert.match(formatarDinheiroNativo(10,'USD','pt'),/USD 10,00/);
});
test('suprimento não altera resultado econômico',()=>{
 const m={tipo:'suprimento',valorBRL:convertido.totalBRL,afetaResultado:false,detalhesMoedasNativas:nativos};
 assert.equal(m.afetaResultado,false);
});
