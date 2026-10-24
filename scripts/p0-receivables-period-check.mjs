import assert from 'node:assert/strict';
import { periodoValido, resumirRecebiveis } from '../src/core/receivablesSummary.js';
const clientes=Array.from({length:100},(_,i)=>({id:'C'+i,nome:'Cliente '+i,saldoDevedorBRL:i%2?0:125.15}));
const vendas=Array.from({length:5000},(_,i)=>({
 id:'VENDA-'+i,clienteId:'C'+(i%100),clienteNome:'Cliente '+(i%100),
 tipoDocumento:'venda',estado:i%13?'concluida':'cancelada',
 createdAt:i%5?'2026-10-20T13:00:00.000Z':'2026-08-02T13:00:00.000Z',
 pagamentos:[{formaId:i%3?'crediario':'pix',valorConvertidoBRL:135.50}],
}));
assert.equal(periodoValido('2026-10-01','2026-10-31'),true);
assert.equal(periodoValido('2026-01-01','2026-05-01'),false);
assert.equal(periodoValido('2026-02-30','2026-03-01'),false);
const r=resumirRecebiveis({clientes,historicoVendas:vendas,inicio:'2026-10-01',fim:'2026-10-31'});
assert.equal(r.quantidadeDevedores,50);
assert.equal(r.totalAberto,6257.5);
assert(r.vendas.length>0 && r.vendas.length<5000);
assert(r.vendas.every(v=>v.data>='2026-10-01'&&v.data<='2026-10-31'&&v.valor>0));
assert(r.vendas.every(v=>v.id!=='VENDA-0'));
assert.equal(r.parcelasComVencimentoCertificadas,false);
const historico=resumirRecebiveis({clientes,historicoVendas:vendas,inicio:'2026-08-01',fim:'2026-08-31'});
assert.equal(historico.totalAberto,r.totalAberto);
const quitado=resumirRecebiveis({clientes:[{id:'Q',saldoDevedorBRL:0}],historicoVendas:[],inicio:'2026-10-01',fim:'2026-10-02'});
assert.equal(quitado.totalAberto,0);
assert.equal(quitado.quantidadeDevedores,0);
console.log('Contas a Receber: massa com 5000 vendas, saldo independente do período, sem parcelas inventadas.');
