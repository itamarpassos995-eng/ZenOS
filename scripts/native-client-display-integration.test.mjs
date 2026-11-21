import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatNativeMinor,nativeCreditLimitMinor} from '../src/core/nativeMoneyDisplay.js';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('client headline and list use native balance and limits, not fmt legacy',()=>{
 const clients=source('src/components/Clientes.jsx');
 assert.match(clients,/totalFiadoNativoMinor/);
 assert.match(clients,/formatVerifiedOrPending\(totalFiadoNativoMinor/);
 assert.match(clients,/textoFiadoCliente\(cli\)/);
 assert.match(clients,/textoLimiteCliente\(cli\)/);
 assert.doesNotMatch(clients,/R\$ /);
});
test('sovereign symbols and integer PYG formatting remain unchanged by FX',()=>{
 assert.equal(formatNativeMinor('20278000','PYG'),'₲ 20.278.000');
 assert.equal(formatNativeMinor('1170681','BRL'),'R$ 11.706,81');
 const legacy={limiteCreditoBRL:1000};
 assert.equal(nativeCreditLimitMinor(legacy,'PYG'),null);
 assert.equal(nativeCreditLimitMinor(legacy,'BRL'),'100000');
});
test('global format has native path and explicitly legacy adapter',()=>{
 const app=source('src/App.jsx');
 assert.match(app,/const fmtNativoMinor/);
 assert.match(app,/formatNativeMinor\(minor,codigo\)/);
 assert.match(app,/const fmtNativo/);
 assert.match(app,/const converterMoedaDiretoMinor/);
});
test('PDV customer created in default currency with explicit nominal limit',()=>{
 const pdv=source('src/components/PDV.jsx');
 assert.match(pdv,/limiteCreditoNativo:\{moeda:moedaPadrao,valorMinor:limiteMinor\}/);
 assert.match(pdv,/Limite de fiado/);
 assert.doesNotMatch(pdv,/Limite Fiado \(R\$\)/);
});
