import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const read=file=>readFileSync(file,'utf8');
const before=file=>execFileSync('git',['show','origin/main:'+file],{encoding:'utf8'});

test('Zen IA sai do cabeçalho sem remover o assistente flutuante',()=>{
 const top=read('src/components/ZenVisualLayout.jsx'),app=read('src/App.jsx');
 assert.doesNotMatch(top,/zen-ia-topbar-btn/);
 assert.match(top,/zen-commerce-topbar-btn/);
 assert.match(top,/onAbrirPedidosLoja/);
 assert.match(app,/<ZenAssistenteIA/);
 assert.match(app,/onAbrir=\{\(\) => setAssistenteIAAberto\(true\)\}/);
});

test('botão abre somente a fila de pedidos existente e preserva permissões',()=>{
 const app=read('src/App.jsx'),pdv=read('src/components/PDV.jsx');
 assert.match(app,/temPermissao\('pdv'\) \? abrirPedidosLojaNoPdv : undefined/);
 assert.match(app,/setAbrirFilaOnlineToken\(token => token \+ 1\)/);
 assert.match(app,/navegarPara\('pdv'\)/);
 assert.match(pdv,/abrirFilaOnlineToken/);
 assert.match(pdv,/onPedidosOnlineAtualizados/);
 assert.match(pdv,/setModalResgateAberto\(true\)/);
});

test('nenhum listener Firestore adicional ou consulta ampla foi incluída',()=>{
 for(const file of ['src/App.jsx','src/components/PDV.jsx']){
  const old=before(file),now=read(file);
  const count=s=>(s.match(/\bonSnapshot\s*\(/g)||[]).length;
  assert.equal(count(now),count(old),file);
 }
 const pdv=read('src/components/PDV.jsx');
 for(const token of [
 "where('estado', '==', 'pendente')",
 "limit(PAGINA_PEDIDOS_ONLINE)",
 "startAfter(cursorPedidos)",
 "setPedidosRecentes(snap.docs.map"
 ])assert.ok(pdv.includes(token),token);
});

test('pedido não sobrepõe venda existente sem confirmação',()=>{
 const pdv=read('src/components/PDV.jsx');
 assert.match(pdv,/itensVenda\.length > 0/);
 assert.match(pdv,/pedirConfirmacaoZen/);
 assert.match(pdv,/if \(!autorizado\) return/);
 assert.match(pdv,/carregarPedidoOnline\(ped\)/);
});

test('nenhum arquivo de persistência Firestore nem regras foi modificado',()=>{
 const changed=execFileSync('git',['diff','--name-only','origin/main...HEAD'],{encoding:'utf8'}).trim().split('\n');
 // UI translations may touch multiple screens; persistence engines remain protected.
 const uiOnlyCore=new Set(['src/core/uiLanguage.js','src/core/useUiLanguage.js','src/core/fiscalErrorUi.js']);
 // Exceção pontual: este PR corrige a reconciliação física multimoeda.
 // O módulo permanece puro e não pode passar a consultar Firestore.
 const allowedFinancialCore='src/core/cashReconciliation.js';
 const allowedCashGuard='src/core/productionSync.js';
 const allowedReadOnlyAudit='src/core/financialAudit.js';
 const allowedCashHistory='src/core/cashHistoryDisplay.js';
 if(changed.includes(allowedCashHistory)){
   const source=read(allowedCashHistory);
   assert.doesNotMatch(source,/firebase\/firestore|\bonSnapshot\s*\(|\bgetDocs(?:FromServer)?\s*\(|\bgetDoc(?:FromServer)?\s*\(|\brunTransaction\s*\(/,'Histórico nativo não pode acessar o Firestore');
   assert.match(source,/obterComposicaoHistoricaCaixa/);
 }
 if(changed.includes(allowedReadOnlyAudit)){
   const source=read(allowedReadOnlyAudit);
   assert.doesNotMatch(source,/firebase\/firestore|\bonSnapshot\s*\(|\bgetDocs(?:FromServer)?\s*\(|\bgetDoc(?:FromServer)?\s*\(|\brunTransaction\s*\(/,'Auditoria financeira deve ser apenas cálculo puro, sem acesso ao Firestore');
 }
 if(changed.includes(allowedCashGuard)){
   const source=read(allowedCashGuard);
   assert.match(source,/guard\.type === 'cash_native_balance_at_least'/);
   assert.match(source,/calcularConciliacaoFisicaMultimoeda/);
 }
 if(changed.includes(allowedFinancialCore)){
   const source=read(allowedFinancialCore);
   assert.doesNotMatch(source,/firebase\/firestore|\bonSnapshot\s*\(|\bgetDocs(?:FromServer)?\s*\(|\bgetDoc(?:FromServer)?\s*\(|\brunTransaction\s*\(/,
    'A reconciliação financeira não pode adicionar consultas ou listeners Firestore');
 }
 const protectedPaths=changed.filter(path=>
   /(^|\/)firestore[^/]*\.rules$/.test(path)||
   /^src\/firebase[^/]*\.[jt]s$/.test(path)||
   /^functions\//.test(path)||
   (/^src\/core\//.test(path)&&!uiOnlyCore.has(path)&&path!==allowedFinancialCore&&path!==allowedCashGuard&&path!==allowedReadOnlyAudit&&path!==allowedCashHistory)
 );
 assert.deepEqual(protectedPaths,[],'A mudança visual não pode alterar persistência nem regras');
});
