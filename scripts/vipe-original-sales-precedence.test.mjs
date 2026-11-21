import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {apurarFiadoMoedaPadrao} from '../src/core/defaultCurrencyCreditCard.js';
import {legacyCreditPYGMinor,VIPE_STORE_ID} from '../src/core/vipeLegacyNative.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('original native sale wins over rounded BRL reconstruction when verified',()=>{
 const cliente=[{id:'C1',saldoDevedorBRL:21.74}];
 const venda={id:'V1',clienteId:'C1',estado:'concluida',tipoDocumento:'venda',
   moedaDocumento:'PYG',pagamentos:[{formaId:'crediario',moedaOrigem:'PYG',
     valorOriginal:25000,valorConvertidoBRL:21.74}],devolucoes:[]};
 assert.equal(apurarFiadoMoedaPadrao(cliente,'PYG',[venda],[]).totalNativo,25000);
 assert.equal(legacyCreditPYGMinor(21.74,VIPE_STORE_ID,'PYG'),'25001');
 const app=source('src/App.jsx');
 assert.ok(app.indexOf('origemComprovada=apurarFiadoMoedaPadrao')<app.indexOf('const valores=clientes.map((c,i)=>vipeReceivableMinor'));
 const clients=source('src/components/Clientes.jsx');
 assert.match(clients,/saldoDeVendasNativas/);
 assert.match(clients,/if\(comprovado!=null\)return comprovado/);
});
