import test from 'node:test';
import assert from 'node:assert/strict';
import {renderControlCenter} from '../src/server/control-center-ui.mjs';
const overview={organizations:2,active_subscriptions:1,trials:1,overdue_invoices:0};
test('dashboard renders real counts and never demo revenue',()=>{
 const html=renderControlCenter('/',overview,[]);
 assert.match(html,/Empresas cadastradas/);
 assert.match(html,/Assinaturas ativas/);
 assert.doesNotMatch(html,/16\.092|128 empresas/);
});
test('navigation has every approved section',()=>{
 const html=renderControlCenter('/',overview,[]);
 for(const route of ['/clientes','/mensalidades','/planos','/solicitacoes','/relatorios','/configuracoes'])assert.ok(html.includes('href="'+route+'"'));
});
test('organization labels are escaped',()=>{
 const html=renderControlCenter('/clientes',overview,[{display_name:'<script>alert(1)</script>',country:'PY'}]);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
});
test('non-integrated actions cannot pretend success',()=>{
 const html=renderControlCenter('/clientes',overview,[]);
 assert.match(html,/disabled/);
 assert.match(html,/pendentes de integração/);
});
