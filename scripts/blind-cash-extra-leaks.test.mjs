import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('refund UI does not expose expected drawer amounts',()=>{
 const source=read('src/components/Vendas.jsx');
 assert.doesNotMatch(source,/Disponível: \$\{fmt\(caixaReembolsoSelecionado/);
 assert.doesNotMatch(source,/\{fmt\(resumo\.saldoEsperado/);
 assert.doesNotMatch(source,/sort\(\(a,b\) => Number\(b\.resumo\.saldoEsperado/);
 assert.match(source,/O saldo esperado é reservado à gerência/);
});
test('AI assistant never discloses drawer expected, initial or estimated amounts',()=>{
 const assistant=read('src/components/ZenAssistenteIA.jsx');
 assert.doesNotMatch(assistant,/fmt\(saldoSessaoFisicoBRL\)/);
 assert.doesNotMatch(assistant,/fmt\(sessaoAtiva\.saldoInicial/);
 const app=read('src/App.jsx');
 const begin=app.indexOf('<ZenAssistenteIA');
 const end=app.indexOf('/>',begin);
 assert.ok(begin>0&&end>begin);
 assert.doesNotMatch(app.slice(begin,end),/saldoSessaoFisicoBRL=/);
});
