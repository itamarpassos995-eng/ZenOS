import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classificarMovimentoCaixaConfirmado as avaliar} from '../../src/core/cashMovementReadOnly.js';
const cash={id:123,sessaoId:'cx-1',tipo:'sangria',valorBRL:10};
const item={...cash};
const ledger={referenciaId:'123',sessaoId:'cx-1',tipo:'sangria',valor:10,origem:'caixa_manual'};
test('duas provas do servidor confirmam somente a retirada original, sem escrever',()=>{
 assert.equal(avaliar({tentativa:cash,movimentos:[item],lancamento:ledger}).status,'confirmed');
});
test('não libera em caixa ausente, livro ausente, repetido, valor e sessão divergentes',()=>{
 for(const [movimentos,lancamento] of [
  [[],ledger],[[item],null],[[item,item],ledger],[[item],{...ledger,valor:30}],
  [[{...item,sessaoId:'cx-2'}],ledger],[[item],{...ledger,origem:'venda'}]
 ]) assert.notEqual(avaliar({tentativa:cash,movimentos,lancamento}).status,'confirmed');
});
const app=readFileSync(new URL('../../src/App.jsx',import.meta.url),'utf8');
test('a UI não repete o lançamento depois de ACK incerto ou recarregamento',()=>{
 assert.match(app,/pendenciaAnterior = pendenciaKey \? zenosStorage\.getItem/);
 assert.match(app,/verificarMovimentoCaixaNoServidor\(\{db,userId,tentativa\}\)/);
 assert.match(app,/if\(verificacao\.status==='confirmed'\)/);
 assert.match(app,/zenosStorage\.setItem\(pendenciaKey/);
 assert.match(app,/zenosStorage\.removeItem\(pendenciaKey\)/);
 assert.match(app,/movCaixaResultadoIncertoRef\.current = true/);
 assert.match(app,/setInterval\(recalcularStatus, 5_000\)/);
 assert.match(app,/Confirmação do caixa pendente/);
});
