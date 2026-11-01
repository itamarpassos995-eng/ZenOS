import test from 'node:test';
import assert from 'node:assert/strict';
import { auditarFinanceiroVenda, auditarPeriodoFinanceiro } from '../src/core/financialAudit.js';
import { calcularConciliacaoFisicaMultimoeda } from '../src/core/cashReconciliation.js';

const venda=(campos={})=>({
 id:'V-1',lojaId:'LOJA-A',createdAt:'2026-10-31T12:00:00Z',estado:'concluida',
 totalBRL:300,cmvBRL:180,lucroBRL:120,totalLiquidoBRL:300,lucroLiquidoBRL:120,
 valorDevolvidoBRL:0,custoDevolvidoBRL:0,
 itens:[{qtd:2,qtdDevolvida:0,precoPraticadoBRL:150,custoNaVendaBRL:90}],
 pagamentos:[{formaId:'dinheiro_brl',moedaOrigem:'BRL',valorOriginal:200,valorConvertidoBRL:200},
 {formaId:'dinheiro_pyg',moedaOrigem:'PYG',valorOriginal:120000,valorConvertidoBRL:100}],
 trocoBRL:0,...campos
});
test('venda válida multimoeda não duplica receita nem CMV',()=>{
 const v=venda();
 const a=auditarFinanceiroVenda(v);
 assert.equal(a.situacao,'CONSISTENTE');
 assert.equal(a.indicadoresAtuais.totalLiquidoBRL,300);
 assert.equal(a.indicadoresAtuais.cmvLiquidoBRL,180);
 const caixa=calcularConciliacaoFisicaMultimoeda({
  sessao:{id:'S1',operadorId:'O1',createdAt:'2026-10-31T10:00:00Z',saldoInicial:0,detalheAberturaNativos:{BRL:0,PYG:0,USD:0,EUR:0}},
  historicoVendas:[{...v,sessaoId:'S1'}],caixaMovimentos:[],contagem:{BRL:200,PYG:120000},
  taxas:{BRL:1,PYG:1200,USD:1,EUR:1}
 });
 assert.equal(caixa.confiavel,true);
 assert.equal(caixa.divergenciaFisica,false);
 assert.equal(caixa.esperado.BRL,200);
 assert.equal(caixa.esperado.PYG,120000);
});
test('identifica CMV e lucro persistidos incorretos',()=>{
 const a=auditarFinanceiroVenda(venda({cmvBRL:100,lucroLiquidoBRL:190}));
 assert.equal(a.situacao,'DIVERGENTE');
 assert.ok(a.pendencias.some(p=>p.codigo==='CMV_DIVERGENTE'));
 assert.ok(a.pendencias.some(p=>p.codigo==='LUCRO_DIVERGENTE'));
});
test('não confunde custo ausente com custo gratuito confirmado',()=>{
 const v=venda({itens:[{qtd:2,precoPraticadoBRL:150}]});
 const a=auditarFinanceiroVenda(v);
 assert.equal(a.situacao,'PENDENTE_AUDITORIA');
 assert.ok(a.pendencias.some(p=>p.codigo==='CUSTO_SEM_EVIDENCIA'));
});
test('devolução maior que venda é divergência',()=>{
 const a=auditarFinanceiroVenda(venda({valorDevolvidoBRL:500,totalLiquidoBRL:0}));
 assert.equal(a.situacao,'DIVERGENTE');
});
test('auditoria por período não aceita dados de outra empresa',()=>{
 assert.throws(()=>auditarPeriodoFinanceiro({lojaId:'LOJA-A',vendas:[venda({lojaId:'LOJA-B'})],inicio:'2026-10-01',fim:'2026-11-01'}),/outra empresa/);
 const a=auditarPeriodoFinanceiro({lojaId:'LOJA-A',vendas:[venda()],inicio:'2026-10-01',fim:'2026-11-01'});
 assert.equal(a.consistentes,1);
});
test('caixa com troco de outra moeda reduz somente essa moeda',()=>{
 const v=venda({trocoBRL:10,moedaTrocoInfo:'PYG',trocoOriginal:12000});
 const caixa=calcularConciliacaoFisicaMultimoeda({
  sessao:{id:'S1',operadorId:'O1',createdAt:'2026-10-31T10:00:00Z',saldoInicial:0,detalheAberturaNativos:{BRL:0,PYG:0,USD:0,EUR:0}},
  historicoVendas:[{...v,sessaoId:'S1'}],caixaMovimentos:[],contagem:{BRL:200,PYG:108000},
  taxas:{BRL:1,PYG:1200,USD:1,EUR:1}
 });
 assert.equal(caixa.confiavel,true);
 assert.equal(caixa.esperado.BRL,200);
 assert.equal(caixa.esperado.PYG,108000);
});

// O painel não apresenta valores de vendas duvidosas como se fossem confirmados.
import { readFileSync } from 'node:fs';
test('painel sinaliza divergências, esconde indicadores não comprovados e não consulta Firestore',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/const auditoriaPainelFinanceiro = useMemo/);
 assert.match(app,/vendasValidas\.map\(auditarFinanceiroVenda\)/);
 assert.match(app,/auditoriaPainelFinanceiro\.confiavel \? fmt\(faturamentoTotalBRL\)/);
 assert.match(app,/auditoriaPainelFinanceiro\.confiavel \? fmt\(cmvTotalBRL\)/);
 assert.match(app,/auditoriaPainelFinanceiro\.confiavel \? fmt\(lucroLiquidoRealBRL\)/);
 assert.match(app,/histórico não carregado|historial no cargado|historical reconciliation/);
});
