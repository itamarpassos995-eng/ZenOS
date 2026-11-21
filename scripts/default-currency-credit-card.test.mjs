import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {apurarFiadoMoedaPadrao} from '../src/core/defaultCurrencyCreditCard.js';

const cliente=(saldo)=>[{id:'C1',saldoDevedorBRL:saldo}];
const venda={id:'V1',clienteId:'C1',estado:'concluida',tipoDocumento:'venda',
  moedaDocumento:'PYG',pagamentos:[{formaId:'crediario',moedaOrigem:'PYG',
    valorOriginal:25000,valorConvertidoBRL:21.74}],devolucoes:[]};
test('fiado PYG com documentos originais e livro reconciliado não varia com cotação atual',()=>{
 const r=apurarFiadoMoedaPadrao(cliente(21.74),'PYG',[venda],[]);
 assert.deepEqual(r,{status:'confirmado',totalNativo:25000,totalBRL:21.74,moeda:'PYG',pendentes:0});
 const antes=JSON.stringify(venda);
 assert.equal(apurarFiadoMoedaPadrao(cliente(21.74),'PYG',[venda],[]).totalNativo,25000);
 assert.equal(JSON.stringify(venda),antes);
});
test('recebimento PYG reduz saldo nominal e contábil na mesma transação já registrada',()=>{
 const r=apurarFiadoMoedaPadrao(cliente(10.87),'PYG',[venda],
  [{tipo:'recebimento_fiado',clienteId:'C1',valor:10.87,detalhes:{moedaOrigem:'PYG',valorOriginal:12500}}]);
 assert.equal(r.totalNativo,12500);
});
test('não presume guaranis de total BRL quando falta venda ou moeda original',()=>{
 assert.equal(apurarFiadoMoedaPadrao(cliente(11706.81),'PYG',[],[]).totalNativo,null);
 const r=apurarFiadoMoedaPadrao(cliente(21.74),'PYG',
   [{...venda,pagamentos:[{formaId:'crediario',valorConvertidoBRL:21.74}]}],[]);
 assert.equal(r.status,'sem_origem_nativa');
});
test('recebimento misto/sem taxa contratual não inventa PYG',()=>{
 const r=apurarFiadoMoedaPadrao(cliente(10.87),'PYG',[venda],
  [{tipo:'recebimento_fiado',clienteId:'C1',valor:10.87,detalhes:{moedaOrigem:'BRL',valorOriginal:10.87}}]);
 assert.equal(r.status,'sem_origem_nativa');
});
test('divergência com saldo atual bloqueia apresentação como valor confirmado',()=>{
 assert.equal(apurarFiadoMoedaPadrao(cliente(999),'PYG',[venda],[]).status,'sem_origem_nativa');
});
test('BRL padrão exibe BRL sem conversão e nenhuma dívida confirma zero PYG',()=>{
 assert.equal(apurarFiadoMoedaPadrao(cliente(11706.81),'BRL',[],[]).totalNativo,11706.81);
 assert.equal(apurarFiadoMoedaPadrao(cliente(0),'PYG',[],[]).totalNativo,0);
});
test('dashboard nunca exibe BRL como valor principal de fiado em loja PYG',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/apurarFiadoMoedaPadrao\(clientes,moedaPadrao,historicoVendas,livroFinanceiro\)/);
 assert.match(app,/fiadoPainelMoedaPadrao\.status==='confirmado'/);
 assert.doesNotMatch(app,/titulo=\{tx\('FIADO NA PRAÇA'[\s\S]{0,220}?valor=\{valoresTopoVisiveis \? fmt\(totalFiadoAbertoBRL,'BRL'\)/);
});

test('painel PYG com dívidas sem comprovação não mostra zero nem traço como valor principal',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const inicio=app.indexOf('<ZenKpiCard icon="👥"');
 const fim=app.indexOf('/>',inicio);
 const painel=app.slice(inicio,fim);
 assert.match(painel,/clientesComFiadoAberto/);
 assert.match(painel,/Dívida existente; total nativo em conferência/);
 assert.match(painel,/fmt\(totalFiadoAbertoBRL,'BRL'\)/);
 assert.doesNotMatch(painel,/moedaPadrao==='PYG'\?'Gs\.'/);
});
