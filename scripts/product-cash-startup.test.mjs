import test from 'node:test';
import assert from 'node:assert/strict';
import {valoresProdutoParaBRL,produtoParaFormularioMonetario} from '../src/core/productMoney.js';
import {intervaloCaixa,filtrarTurnosCaixa,diferencaHistoricaCaixa,dataTurnoCaixa,turnoCaixaFechado} from '../src/core/cashAuditHistory.js';
import {executarLotes} from '../src/core/boundedTasks.js';
const rate=1150,toBRL=(v,m)=>m==='PYG'?v/rate:v,fromBRL=(v,m)=>m==='PYG'?v*rate:v;
test('Gs 39.990 salvo/reaberto mantém valor e preços alternativos sem multiplicação',()=>{
 const original={custoBRL:'20.000',precoBRL:'39.990',preco2BRL:'38.000',preco3BRL:''};
 const saved=valoresProdutoParaBRL(original,'PYG',toBRL);
 assert.equal(saved.precoBRL,39990/1150);
 const form=produtoParaFormularioMonetario(saved,'PYG',fromBRL);
 assert.equal(form.precoBRL,'39990');assert.equal(form.custoBRL,'20000');assert.equal(form.preco2BRL,'38000');
 assert.deepEqual(valoresProdutoParaBRL(form,'PYG',toBRL),saved);
 assert.equal(produtoParaFormularioMonetario({precoBRL:280},'BRL',fromBRL).precoBRL,'280.00');
 assert.throws(()=>valoresProdutoParaBRL({...original,precoBRL:'10,50'},'PYG',toBRL));
});
test('histórico não apresenta null nem totais contraditórios como diferença zero',()=>{
 const s={status:'fechada',saldoInformado:1445,saldoSistema:1941.74,diferenca:null,situacaoConciliacao:'PENDENTE_AUDITORIA'};
 assert.equal(diferencaHistoricaCaixa(s).pendente,true);
 assert.equal(diferencaHistoricaCaixa({...s,diferenca:0,situacaoConciliacao:'CONCILIADO'}).pendente,true);
 assert.equal(diferencaHistoricaCaixa({...s,saldoInformado:1941.74,diferenca:0,situacaoConciliacao:'CONCILIADO'}).pendente,false);
 const antigo={status:'fechada',saldoInformado:3450000,saldoSistema:412.22,diferenca:3449587.78};
 diferencaHistoricaCaixa(antigo);assert.equal(antigo.saldoInformado,3450000);
});
test('filtros usam intervalo semiaberto e virada de mês/ano',()=>{
 const now=new Date(2026,0,15,12);const previous=intervaloCaixa('anterior',now);
 assert.equal(new Date(previous.inicio).getFullYear(),2025);assert.equal(new Date(previous.inicio).getMonth(),11);
 assert.equal(filtrarTurnosCaixa([{createdAt:previous.inicio},{createdAt:previous.fim}],previous).length,1);
 assert.throws(()=>intervaloCaixa('personalizado',now,'2026-02-30','2026-03-02'));
 assert.throws(()=>intervaloCaixa('personalizado',now,'2026-03-02','2026-03-01'));
});
test('hidratação limita a três coleções, aguarda falhas e não executa próximo lote',async()=>{
 let active=0,peak=0,done=0;
 await executarLotes([1,2,3,4,5],async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--;done++;});
 assert.equal(peak,3);assert.equal(done,5);
 let completed=false,started=0;
 await assert.rejects(executarLotes([1,2,3,4],async i=>{started++;if(i===1)throw Error('fail');await new Promise(r=>setTimeout(r,2));completed=true;}));
 assert.equal(completed,true);assert.equal(started,3);
});

test('histórico inclui abertura antiga em DD/MM/YYYY e timestamp de ID sem alterar registros',()=>{
 const origem=[{id:'antigo',abertura:'31/10/2026, 11:59:26',status:'fechada'},{id:'SESSAO-'+new Date(2026,9,30,10).getTime(),status:'closed'}];
 const before=JSON.stringify(origem),range=intervaloCaixa('personalizado',new Date(),'2026-10-01','2026-10-31');
 assert.equal(filtrarTurnosCaixa(origem,range).length,2);
 assert.equal(new Date(dataTurnoCaixa(origem[0])).getDate(),31);
 assert.equal(turnoCaixaFechado(origem[1]),true);
 assert.equal(dataTurnoCaixa({id:'sem-data'}),null);
 assert.equal(JSON.stringify(origem),before);
});
