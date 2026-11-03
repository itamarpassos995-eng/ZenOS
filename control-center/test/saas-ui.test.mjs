import test from 'node:test';
import assert from 'node:assert/strict';
import {renderControlCenter} from '../src/server/control-center-ui.mjs';
const overview={organizations:1001,active_subscriptions:1,trials:0,overdue_invoices:0};
const data={plans:[],modules:[],invoices:[],revenue:[],activities:[],growth:[],commands:[],requests:[]};
const rows=[{id:'00000000-0000-4000-8000-000000000001',firebase_uid:'company-test',display_name:'Empresa <script>maliciosa</script>',country:'BR',internal_note:'" onmouseover="alert(1)',applied_state:null,delivery_state:'pending'}];
test('layout aprovado e lista única permanecem com formulários reais dentro da empresa',()=>{
 const html=renderControlCenter('/clientes',overview,[],{rows,total:1001,page:3,pages:41},'csrf','Empresa',{data,context:{roles:['owner'],country:'BR',status:'active',sort:'newest'}});
 assert.equal((html.match(/<details class="client-row"/g)||[]).length,1);
 assert.equal((html.match(/<summary>/g)||[]).length,1);
 assert.match(html,/background:#101d31/);assert.match(html,/background:#f3f6fa/);assert.match(html,/background:#0ab4a6/);
 assert.match(html,/return_page" value="3"/);assert.match(html,/return_country" value="BR"/);
 assert.match(html,/Solicitar suspensão/);assert.match(html,/Emitir mensalidade avulsa/);
 assert.doesNotMatch(html,/<script>maliciosa/);assert.doesNotMatch(html,/value="" onmouseover=/);
 assert.match(html,/Acesso confirmado:<\/strong> Não confirmado/);assert.match(html,/Integração:<\/strong> Pendente/);
});
test('auditor não recebe formulários de escrita e todas as seções usam a mesma shell',()=>{
 const html=renderControlCenter('/clientes',overview,[],{rows,total:1,page:1,pages:1},'csrf','',{data,context:{roles:['auditor']}});
 assert.doesNotMatch(html,/name="action"/);
 for(const path of ['/','/clientes','/mensalidades','/planos','/solicitacoes','/relatorios','/configuracoes']){
  const body=renderControlCenter(path,overview,[],{rows:[]},'csrf','',{data,context:{roles:['owner']}});assert.match(body,/class="shell"/);assert.match(body,/class="side"/);assert.match(body,/class="top"/);
 }
});
test('gráfico não mistura moedas nem cria receitas inexistentes',()=>{
 const html=renderControlCenter('/',overview,[],{},'csrf','',{data:{...data,revenue:[{currency:'BRL',month_label:'2026-11',amount:'50.0000'},{currency:'PYG',month_label:'2026-11',amount:'10000.0000'}]},context:{roles:['owner']}});
 assert.match(html,/Receita mensal confirmada em BRL/);assert.match(html,/Receita mensal confirmada em PYG/);assert.doesNotMatch(html,/10050/);
});
