import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../../src/components/PDV.jsx',import.meta.url),'utf8');
test('reconciliação de pré-pedido usa servidor e ID original',()=>{
 assert.match(s,/tipoFinalizacao === 'pre_pedido'/);
 assert.match(s,/await getOperationalSnapshot\(db, userId\)/);
 assert.match(s,/String\(v\?\.id \?\? ''\) === String\(vendaId\)/);
 assert.match(s,/v\?\.estado === 'pendente'/);
 assert.match(s,/if \(confirmadoNoServidor\)/);
 assert.match(s,/setHistoricoVendas\(pedidos\)/);
});
test('falha desconhecida não afirma rejeição financeira',()=>{
 assert.doesNotMatch(s,/Nada foi finalizado no PDV/);
 assert.match(s,/verifique o histórico antes de repetir/);
});
