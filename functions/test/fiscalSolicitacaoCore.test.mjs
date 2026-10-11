import test from 'node:test';
import assert from 'node:assert/strict';
import {cnpjValido,validarCadastroSolicitacao,FiscalSolicitacaoError} from '../src/fiscalSolicitacaoCore.js';

test('CNPJ rejeita zeros, tamanho incorreto e dígito inválido',()=>{
 assert.equal(cnpjValido('00.000.000/0000-00'),false);
 assert.equal(cnpjValido('123'),false);
 assert.equal(cnpjValido('11.222.333/0001-81'),true);
 assert.equal(cnpjValido('11.222.333/0001-82'),false);
});
test('Brasil cria solicitação com campos permitidos, sem chaves secretas',()=>{
 const x=validarCadastroSolicitacao({pais:'BR',cadastro:{razaoSocial:' Loja Teste ',cnpj:'11.222.333/0001-81',email:'teste@example.com',apiKey:'NAO_GRAVAR',ruc:'123456'}});
 assert.equal(x.cadastro.cnpj,'11222333000181');
 assert.equal(x.cadastro.razaoSocial,'Loja Teste');
 assert.equal(Object.hasOwn(x.cadastro,'apiKey'),false);
 assert.equal(Object.hasOwn(x.cadastro,'ruc'),false);
});
test('Paraguai cria solicitação independente do Brasil',()=>{
 const x=validarCadastroSolicitacao({pais:'PY',cadastro:{razonSocial:'Comercio',ruc:'80012345',telefone:'0981123456',cnpj:'11222333000181'}});
 assert.equal(x.pais,'PY');
 assert.equal(x.cadastro.ruc,'80012345');
 assert.equal(Object.hasOwn(x.cadastro,'cnpj'),false);
});
test('solicitação exige dados mínimos e contato',()=>{
 assert.throws(()=>validarCadastroSolicitacao({pais:'BR',cadastro:{razaoSocial:'Teste',cnpj:'11.222.333/0001-81'}}),FiscalSolicitacaoError);
 assert.throws(()=>validarCadastroSolicitacao({pais:'XX'}),FiscalSolicitacaoError);
 assert.throws(()=>validarCadastroSolicitacao({pais:'BR',cadastro:{razaoSocial:'Teste',cnpj:'11.222.333/0001-81',email:'invalido'}}),FiscalSolicitacaoError);
});
