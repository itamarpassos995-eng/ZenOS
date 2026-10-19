import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const lookup=readFileSync(new URL('../../src/core/productServerLookup.js',import.meta.url),'utf8');
const products=readFileSync(new URL('../../src/components/Produtos.jsx',import.meta.url),'utf8');
test('busca usa documentos do servidor e nunca cria produtos ou manipula índices',()=>{
 assert.match(lookup,/getDocFromServer/);
 assert.match(lookup,/getOperationalSnapshot/);
 assert.doesNotMatch(lookup,/getDocFromCache|setDoc|deleteDoc|updateDoc|runTransaction/);
 assert.match(lookup,/status:'orphan_index'/);
 assert.match(lookup,/matches\.length===1/);
});
test('busca do produto existente revela inativos e restaura filtro',()=>{
 assert.match(products,/localizarProdutoExistenteServidor/);
 assert.match(products,/setProdutos\(localizado\.catalog\)/);
 assert.match(products,/setMostrarInativos\(true\)/);
 assert.match(products,/setFiltroGrupo\('todos'\)/);
});
