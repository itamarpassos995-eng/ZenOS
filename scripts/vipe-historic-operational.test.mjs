import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VIPE_STORE_ID} from '../src/core/vipeLegacyNative.js';
import {produtoParaFormularioMonetario} from '../src/core/productMoney.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('VIPE product editor never revalues old PYG numbers from live FX',()=>{
 const item={custoBRL:80000,precoBRL:160000};
 const form=produtoParaFormularioMonetario(item,'PYG',()=>999999,VIPE_STORE_ID,'PYG');
 assert.equal(form.precoBRL,'160000');
 assert.equal(form.custoBRL,'80000');
 assert.equal(form.moedaPreco,'PYG');
 assert.equal(form.moedaCusto,'PYG');
});
test('customer summary reads historic BRL credit via 1150 not raw BRL',()=>{
 const clients=read('src/components/Clientes.jsx');
 const app=read('src/App.jsx');
 assert.match(clients,/legacyCreditPYGMinor\(cli\?\.limiteCreditoBRL/);
 assert.match(clients,/vipeReceivableMinor\(cli,r,userId,moedaPadrao\)/);
 assert.match(app,/vipeReceivableMinor\(c,carteiras\[i\],userId,moedaPadrao\)/);
 assert.doesNotMatch(clients,/legacyPYGMinor\(cli\?\.saldoDevedorBRL/);
});
test('server native credit guard uses authenticated store id in V1 and V2',()=>{
 assert.match(read('src/core/productionSync.js'),/assertBusinessGuards\(data, guards, userId\)/);
 assert.match(read('src/core/operationalV2.js'),/checks\.assertBusinessGuards\(remote,guards,userId\)/);
 assert.match(read('src/core/nativeCreditGuard.js'),/legacyCreditPYGMinor\(cliente\.limiteCreditoBRL,storeId,moeda\)/);
});
test('operator cash card contains status and actions only (not an estimated transaction list)',()=>{
 const app=read('src/App.jsx');
 const start=app.indexOf('id="zen-meu-turno"');
 const end=app.indexOf('</section>',start);
 const home=app.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(home,/CAIXA CEGO/);
 assert.match(home,/zen-cash-actions/);
 assert.doesNotMatch(home,/zen-movements|caixaFisicoNativo\.esperado|m\.valorBRL/);
});
test('management cash history uses native amounts and no BRL equivalent subtitle',()=>{
 const c=read('src/components/GestaoCaixas.jsx');
 assert.match(c,/detalhe\.composicaoEsperadaNativa\?\.\[moedaPadrao\]/);
 assert.match(c,/diferencaNativa/);
 assert.doesNotMatch(c,/Equivalente registrado em BRL/);
});
