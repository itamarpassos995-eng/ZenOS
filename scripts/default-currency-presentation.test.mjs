import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {apresentarMovimentoNaMoedaPadrao,rotuloEquivalenteContabil} from '../src/core/defaultCurrencyPresentation.js';

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
 assert.match(app,/setMoeda\(prev => prev === moedaPadraoAnteriorRef\.current \? moedaConfig : prev\)/);
 assert.match(app,/moedaPadraoAnteriorRef\.current = moedaConfig/);
 assert.match(app,/moedaPadraoAnteriorRef\.current = moeda/);
});
