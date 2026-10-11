import test from 'node:test';
import assert from 'node:assert/strict';
import { validarIdentidadeFiscal } from '../src/fiscalAuthorizationCore.js';

test('nega chamada não autenticada', () => {
  assert.deepEqual(validarIdentidadeFiscal(null), {ok:false,httpsCode:'unauthenticated',fiscalCode:'FISCAL_NAO_AUTENTICADO'});
});
test('nega UID vazio', () => assert.equal(validarIdentidadeFiscal({uid:'  '}).fiscalCode,'FISCAL_NAO_AUTENTICADO'));
test('nega loja de outro usuário', () => assert.equal(validarIdentidadeFiscal({uid:'loja-A'},'loja-B').fiscalCode,'FISCAL_LOJA_DIVERGENTE'));
test('nega identificador não textual', () => assert.equal(validarIdentidadeFiscal({uid:'loja-A'},123).fiscalCode,'FISCAL_LOJA_DIVERGENTE'));
test('aceita proprietário quando loja é igual ao UID', () => assert.deepEqual(validarIdentidadeFiscal({uid:'loja-A'},'loja-A'),{ok:true,lojaId:'loja-A'}));
test('mantém compatibilidade quando loja não é informada', () => assert.deepEqual(validarIdentidadeFiscal({uid:'loja-A'}),{ok:true,lojaId:'loja-A'}));
test('não aceita loja parcialmente semelhante', () => assert.equal(validarIdentidadeFiscal({uid:'loja-A'},'loja-A-outra').ok,false));
