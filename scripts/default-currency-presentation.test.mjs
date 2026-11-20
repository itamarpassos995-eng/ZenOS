import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {apresentarMovimentoNaMoedaPadrao,rotuloEquivalenteContabil,apresentarVendaHistorica} from '../src/core/defaultCurrencyPresentation.js';

test('caixa em PYG mostra movimento nativo PYG, jamais recálculo pela taxa atual',()=>{
 const m={id:'a',tipo:'suprimento',valorBRL:25,detalhesMoedasNativas:{PYG:25000},taxasCambioMovimento:{PYG:1000}};
 const snapshot=JSON.stringify(m);
 const r=apresentarMovimentoNaMoedaPadrao(m,'PYG');
 assert.equal(r.pendente,false);
 assert.equal(r.moedaPrincipal,'PYG');
 assert.equal(r.valorPrincipal,25000);
 assert.equal(JSON.stringify(m),snapshot);
});
test('movimento efetivamente em BRL mantém BRL mesmo se padrão for PYG',()=>{
 const r=apresentarMovimentoNaMoedaPadrao({valorBRL:21.74,detalhesMoedasNativas:{BRL:21.74}},'PYG');
 assert.equal(r.moedaPrincipal,'BRL');
 assert.equal(r.foraDaPadrao,true);
});
test('devolução legada sem composição não inventa PYG nem afirma R$ como moeda entregue',()=>{
 const m={tipo:'saida_devolucao',valorBRL:21.74,detalhesMoedas:{BRL:21.74}};
 const r=apresentarMovimentoNaMoedaPadrao(m,'PYG');
 assert.equal(r.moedaPrincipal,null);
 assert.equal(r.valorPrincipal,null);
 assert.equal(r.pendente,true);
 assert.equal(r.composicao.comprovada,false);
});
test('movimento com duas moedas exibe decomposição, não soma moedas diferentes',()=>{
 const r=apresentarMovimentoNaMoedaPadrao({valorBRL:30,detalhesMoedasNativas:{BRL:10,PYG:22000}},'PYG');
 assert.equal(r.moedaPrincipal,null);
 assert.equal(r.multimoeda,true);
 assert.equal(r.composicao.moedas.length,2);
});
test('indicadores históricos BRL não se apresentam como PYG nativo',()=>{
 assert.match(rotuloEquivalenteContabil('PYG'),/BRL/);
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/apresentarMovimentoNaMoedaPadrao\(m,moedaPadrao\)/);
 assert.match(app,/fmt\(totalFiadoAbertoBRL,'BRL'\)/);
 assert.match(app,/fmt\(faturamentoTotalBRL,'BRL'\)/);
 assert.match(app,/fmt\(lucroBrutoBRL,'BRL'\)/);
 assert.doesNotMatch(app,/m\.valorBRL,'PYG'/);
});
test('configuração salva não reverte seleção manual ao retomar aba',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/resolverMoedaExibidaAoCarregarConfiguracao\(/);
 assert.match(app,/primeiraConfiguracao:primeiraConfigDaSessao, escolhaManual/);
 assert.match(app,/moedaPadraoAnteriorRef\.current = moedaConfig/);
 assert.match(app,/moedaPadraoAnteriorRef\.current = moeda/);
});

test('venda PYG registrada não muda com a cotação atual nem ao imprimir segunda via',()=>{
 const doc={moedaDocumento:'PYG',totalOriginal:25000,totalBRL:25,taxasCambio:{PYG:1000},pagamentos:[{moedaOrigem:'PYG',valorOriginal:25000}]};
 const antes=JSON.stringify(doc);
 assert.deepEqual(apresentarVendaHistorica(doc),{comprovada:true,moeda:'PYG',valor:25000});
 doc.taxasCambio.PYG=1100;
 assert.deepEqual(apresentarVendaHistorica(doc),{comprovada:true,moeda:'PYG',valor:25000});
 assert.notEqual(JSON.stringify(doc),antes);
});
test('venda com reembolso parcial preserva moeda de origem sem cotação atual',()=>{
 const doc={moedaDocumento:'PYG',totalOriginal:25000,totalBRL:25,totalLiquidoBRL:20};
 assert.deepEqual(apresentarVendaHistorica(doc),{comprovada:true,moeda:'PYG',valor:20000});
});
test('recibo antigo sem moeda não recebe PYG inventado',()=>{
 assert.deepEqual(apresentarVendaHistorica({totalBRL:25}),{comprovada:false,moeda:null,valor:null,motivo:'VALOR_NATIVO_NAO_REGISTRADO'});
});
test('histórico de vendas e segunda via priorizam valor e pagamentos nativos',()=>{
 const vendas=readFileSync(new URL('../src/components/Vendas.jsx',import.meta.url),'utf8');
 assert.match(vendas,/apresentarVendaHistorica\(cupomParaImprimir\)/);
 assert.match(vendas,/apresentarVendaHistorica\(venda\)/);
 assert.match(vendas,/formatarDinheiroNativo\(p.valorOriginal,p.moedaOrigem\)/);
});
