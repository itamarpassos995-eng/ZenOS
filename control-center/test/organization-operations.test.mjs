import test from 'node:test';
import assert from 'node:assert/strict';
import {renderControlCenter} from '../src/server/control-center-ui.mjs';
test('gestão permanece na página Clientes sem rota administrativa paralela',()=>{
 const data={rows:[{id:'123',firebase_uid:'abc',display_name:'Empresa A',country:'BR',administrative_status:'regular',bonus_days:0,internal_note:''}],total:1,page:1,pages:1};
 const html=renderControlCenter('/clientes',{organizations:1,active_subscriptions:0,trials:0,overdue_invoices:0},[],data,'csrf');
 assert.match(html,/Gerenciar/);
 assert.doesNotMatch(html,/href="\/admin\/organizations"/);
 assert.match(html,/ainda não alteram o ZenOS principal/);
});
