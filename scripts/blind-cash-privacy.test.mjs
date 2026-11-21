import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('blind cash shift UI cannot display expected balance or an accounting BRL row',()=>{
 const app=source('src/App.jsx');
 const start=app.indexOf('id="zen-meu-turno"');
 const end=app.indexOf('</section>',start);
 const turno=app.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(turno,/CAIXA CEGO/);
 assert.doesNotMatch(turno,/caixaFisicoNativo\.esperado/);
 assert.doesNotMatch(turno,/Equivalente contábil registrado/);
 assert.doesNotMatch(turno,/fmt\(Number\(m\.valorBRL\)/);
});
test('operator receipt and post-close message do not reveal expected balance',()=>{
 const app=source('src/App.jsx');
 const position=app.indexOf('const reciboFechoHTML =');
 const close=app.indexOf('const fechamentoConfirmado =',position);
 const receipt=app.slice(position,close);
 assert.match(receipt,/CONTAGEM CEGA/);
 assert.doesNotMatch(receipt,/conciliacaoFisica\.esperado/);
 assert.doesNotMatch(receipt,/SALDO ESPERADO:/);
 const post=app.slice(app.indexOf("setDescMovCaixa('');",close),app.indexOf('  };',close));
 assert.doesNotMatch(post,/fmtEquivalenteCaixa\(saldoEsperadoBRL\)/);
 assert.doesNotMatch(post,/conciliacaoFisica\.diferencas/);
});
test('cash audit route requires management or admin',()=>{
 assert.match(source('src/App.jsx'),/ecraAtual === 'auditoria_caixas' && \(temPermissao\('admin'\) \|\| patenteUsuario==='gerencia'\)/);
});
test('legacy secondary BRL cash equivalent is removed from shift',()=>{
 const app=source('src/App.jsx');
 assert.doesNotMatch(app,/Equivalente contábil registrado:/);
 const clients=source('src/components/Clientes.jsx');
 assert.match(clients,/saldoNativoClienteMinor/);
 assert.match(clients,/limiteNativoCliente/);
});
