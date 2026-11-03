import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app = readFileSync('src/App.jsx','utf8');
test('saldo de caixa expresso em BRL deve ser convertido antes de formatar na moeda selecionada',()=>{
 assert.match(app,/const fmtEquivalenteCaixa = valorBRL => fmt\(converterDeBRL\(valorBRL, moedaTotalCaixa\), moedaTotalCaixa\)/);
 for(const symbol of ['saldoEsperadoBRL','valInformadoBRL','diferenca','calcularTotalMovBRL()']) {
  assert.ok(app.includes('fmtEquivalenteCaixa('+symbol+')'),symbol);
  assert.ok(!app.includes('fmt('+symbol+', moedaTotalCaixa)'),symbol+' não pode só mudar símbolo');
 }
});
test('resumo do caixa utiliza moeda selecionada e discrimina nativos por moeda',()=>{
 assert.match(app,/tx\('Saldo esperado','Saldo esperado','Expected balance'\)/);
 assert.match(app,/\['BRL','PYG','USD','EUR'\]\.map\(codigo/);
 assert.match(app,/conciliacaoFisica\.esperado\?\.\[codigo\]/);
 assert.match(app,/conciliacaoFisica\.contado\?\.\[codigo\]/);
 assert.match(app,/conciliacaoFisica\.diferencas\?\.\[codigo\]/);
});
test('fechamento ainda faz commit seguro idempotente e preserva guardas',()=>{
 for(const guard of ['cash_session_open','cash_close_snapshot_matches','cash_close_exchange_rates_match'])assert.ok(app.includes(guard),guard);
 assert.match(app,/operationKey: `fechar-caixa:\$\{sessaoAtiva\.id\}`/);
});
