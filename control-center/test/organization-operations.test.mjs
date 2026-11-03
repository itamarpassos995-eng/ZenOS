import test from 'node:test';
import assert from 'node:assert/strict';
import {renderControlCenter} from '../src/server/control-center-ui.mjs';
test('gestão operacional é identificada como homologação e não promete bloqueio real',()=>{
 const html=renderControlCenter('/clientes',{organizations:1,active_subscriptions:0,trials:0,overdue_invoices:0},[{display_name:'Empresa A',firebase_uid:'abc'}]);
 assert.match(html,/href="\/admin\/organizations"/);
 assert.match(html,/ainda não são alterados/);
});
