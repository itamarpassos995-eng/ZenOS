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
 const allowed=new Set([
   'src/App.jsx','src/components/PDV.jsx','src/components/ZenVisualLayout.jsx',
   'src/zenos-dashboard.css','scripts/commerce-topbar-pdv.test.mjs',
   '.github/workflows/commerce-topbar-pdv-ci.yml',
   'api/commerce/inbox.js','src/components/CommerceOrderInbox.jsx',
   'src/components/ZenCommerceStorefront.jsx','src/commerce-homologacao-main.jsx',
   'docs/COMMERCE_FILA_PRIVADA.md','scripts/commerce-private-inbox.test.mjs',
   '.github/workflows/commerce-private-inbox-ci.yml',
   'scripts/commerce-request-release-audit.mjs'
 ]);
 assert.deepEqual(changed.filter(path=>!allowed.has(path)),[]);
});
