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

test('gestao aparece em cada linha e nao cria segunda lista de empresas',()=>{
 const data={rows:[{id:'123',firebase_uid:'loja-a',display_name:'Loja A',country:'BR',administrative_status:'regular',bonus_days:0,internal_note:''}],total:1001,page:2,pages:41};
 const html=renderControlCenter('/clientes',overview,[],data,'csrf-token','Loja');
 assert.equal((html.match(/Loja A/g)||[]).length,1);
 assert.match(html,/Gerenciar/);
 assert.match(html,/Página 2 de 41/);
 assert.match(html,/name="q"/);
 assert.match(html,/value="Loja"/);
 assert.match(html,/page=3/);
 assert.doesNotMatch(html,/Abrir gestão de empresas/);
});
test('empresa maliciosa e nota interna escapadas no painel',()=>{
 const data={rows:[{id:'123',firebase_uid:'loja-a',display_name:'<img src=x>',country:'BR',administrative_status:'regular',bonus_days:0,internal_note:'"><script>alert(1)</script>'}],total:1,page:1,pages:1};
 const html=renderControlCenter('/clientes',overview,[],data,'csrf-token');
 assert.doesNotMatch(html,/<img src=x>|<script>/);
 assert.match(html,/&lt;img src=x&gt;/);
});
