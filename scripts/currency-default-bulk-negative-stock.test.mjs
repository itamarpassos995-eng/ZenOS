import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync('src/App.jsx','utf8');
const prod=readFileSync('src/components/Produtos.jsx','utf8');
const layout=readFileSync('src/components/ZenVisualLayout.jsx','utf8');
test('moeda padrão é persistida em configuração por loja com merge',()=>{
 assert.match(app,/moedaPadrao:moeda,updatedAtClient:/);
 assert.match(app,/setDoc\(doc\(db,'lojas',userId,'dados','configuracoes'\)/);
 assert.match(app,/setMoedaPadrao\(moedaConfig\)/);
 assert.match(app,/setMoeda\('BRL'\); setMoedaPadrao\('BRL'\)/);
 assert.match(layout,/onSalvarMoedaPadrao/);
});
test('atualização em lote exige permissão, confirmação e ACK do servidor',()=>{
 assert.match(prod,/operadorAtivo\?\.permissoes\?\.produtos===true/);
 assert.match(prod,/setConfirmarEstoqueNegativoTodos\(true\)/);
 assert.match(prod,/produtos\.map\(p => \(\{\.\.\.p, permitirEstoqueNegativo: habilitar\}\)\)/);
 assert.match(prod,/if \(!confirmado\?\.cloudOk\) throw/);
 assert.match(prod,/setProdutos\(confirmado\.values\?\.produtos \|\| proposta\)/);
 assert.match(prod,/Number\(p\.estoque\) < 0/);
});
test('a política em lote não adiciona leitura nem listener Firestore',()=>{
 assert.doesNotMatch(prod,/\bonSnapshot\s*\(/);
 assert.match(prod,/changes:\[\{field:'produtos',value:proposta,storageSuffix:'produtos'\}\]/);
});
