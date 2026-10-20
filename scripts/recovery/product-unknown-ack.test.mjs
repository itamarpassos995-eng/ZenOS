import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {resultadoCadastroIndeterminado as unknown} from '../../src/core/productAckOutcome.js';
const product=readFileSync(new URL('../../src/components/Produtos.jsx',import.meta.url),'utf8');
const pdv=readFileSync(new URL('../../src/components/PDV.jsx',import.meta.url),'utf8');
test('resposta ambigua preserva identidade; erro determinístico pode compensar',()=>{
 assert.equal(unknown({code:'unavailable'}),true);
 assert.equal(unknown({code:'deadline-exceeded'}),true);
 assert.equal(unknown({message:'Failed to get documents from server'}),true);
 assert.equal(unknown(new Error('A nuvem não confirmou o cadastro.')),true);
 assert.equal(unknown({code:'permission-denied'}),false);
 assert.equal(unknown({code:'ZENOS_SYNC_CIRCUIT_OPEN'}),false);
});
test('telas de estoque e PDV só liberam índice quando falha é determinística',()=>{
 for(const src of [product,pdv]){
  assert.match(src,/import \{resultadoCadastroIndeterminado\} from '\.\.\/core\/productAckOutcome'/);
  assert.match(src,/if\s*\(!resultadoCadastroIndeterminado\(erro\)\)/);
  assert.match(src,/índice original preservado/);
 }
 assert.match(product,/localizarProdutoExistenteServidor/);
 assert.match(product,/auditarIndicesProdutosServidor/);
});
