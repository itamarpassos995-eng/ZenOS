import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
 conferirSolicitanteCommerce,registrarInteresseCommerce,respostaInteresseCommerce,
 COLECAO_COMMERCE_INTERESSE,DOCUMENTO_COMMERCE_INTERESSE,
} from '../src/commerceInteresseCore.js';

const agora='2026-10-19T18:00:00.000Z';
test('autenticação Firebase exige identidade exata da loja',()=>{
 assert.deepEqual(conferirSolicitanteCommerce({uid:'loja-A'},'loja-A'),{ok:true,lojaId:'loja-A'});
 assert.equal(conferirSolicitanteCommerce(null,'loja-A').ok,false);
 assert.equal(conferirSolicitanteCommerce({uid:'loja-A'},'loja-B').reason,'WRONG_TENANT');
 assert.equal(conferirSolicitanteCommerce({uid:'loja-A'},'../loja-A').ok,false);
 assert.equal(conferirSolicitanteCommerce({uid:'loja-A'},123).ok,false);
 assert.equal(conferirSolicitanteCommerce({uid:'loja-A'},null).ok,true);
});
test('primeira solicitação registrada com status pendente e SEM ativar módulo',()=>{
 const {criar,doc}=registrarInteresseCommerce(null,{lojaId:'loja-A',solicitadoPor:'loja-A',agora,email:'contato@example.com'});
 assert.equal(criar,true);
 assert.deepEqual([doc.lojaId,doc.modulo,doc.status,doc.habilitado],['loja-A','commerce','pendente_analise',false]);
 assert.ok(!Object.hasOwn(doc,'preco'));
 assert.ok(!Object.hasOwn(doc,'operadorPin'));
 assert.ok(!Object.hasOwn(doc,'ativacao'));
 assert.deepEqual(respostaInteresseCommerce(doc),{status:'pendente_analise',habilitado:false,createdAt:agora});
});
test('solicitar novamente é idempotente e não altera pedido/histórico/estado existente',()=>{
 const doc={lojaId:'loja-A',status:'em_analise',createdAt:agora,comentarioInterno:'não expor'};
 const segunda=registrarInteresseCommerce(doc,{lojaId:'loja-A',solicitadoPor:'loja-A',agora:'2026-10-20T14:00:00.000Z'});
 assert.equal(segunda.criar,false);assert.equal(segunda.doc,doc);
 assert.deepEqual(respostaInteresseCommerce(segunda.doc),{status:'em_analise',habilitado:false,createdAt:agora});
});
test('status adulterado ou ativo NÃO habilita Commerce pela solicitação',()=>{
 assert.deepEqual(respostaInteresseCommerce(null),{status:'nao_solicitado',habilitado:false,createdAt:null});
 assert.equal(respostaInteresseCommerce({status:'ativo',habilitado:true}).habilitado,false);
 assert.equal(respostaInteresseCommerce({status:'ativo',habilitado:true}).status,'em_analise');
 assert.equal(respostaInteresseCommerce({status:'__proto__'}).status,'em_analise');
 assert.equal(respostaInteresseCommerce({status:'aprovado'}).status,'aprovado');
});
test('recusa IDs e registros sem vínculo válido; coleção isolada de V1/V2',()=>{
 assert.throws(()=>registrarInteresseCommerce(null,{lojaId:'loja-A',solicitadoPor:'loja-B',agora}));
 assert.equal(COLECAO_COMMERCE_INTERESSE,'commerce_solicitacoes');
 assert.equal(DOCUMENTO_COMMERCE_INTERESSE,'solicitacao');
});
