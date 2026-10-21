import test from 'node:test';
import assert from 'node:assert/strict';
import {classificarCadastroOculto,prepararReativacaoOriginal} from '../../src/core/productRecoveryCore.js';
const id='prod-66346',other='outro-34849';
const produto={id,nome:'Pneu 225/45',sku:'SKU-66346',marca:'X',unidadeMedida:'UN',ativo:false,
 estoque:6,estoqueVitrine:2,estoqueGalpao:4,precoBRL:480,custoBRL:305,inativadoEm:'2026-10-18'};
const idx=[{produtoId:id,sku:'SKU-66346',nome:produto.nome,ativo:true}];
const diag=fields=>classificarCadastroOculto({ownerId:id,catalogoAtual:[produto],catalogoLegado:null,indices:idx,...fields});
test('cadastro original inativo conserva identidade, preço e todos os saldos',()=>{
 const r=diag({});
 assert.equal(r.status,'original_inativo');
 const p=prepararReativacaoOriginal({diagnostico:r,ownerId:id,catalogo:[produto]});
 assert.equal(p.ok,true);
 assert.equal(p.lista[0].id,id);
 for(const campo of ['sku','nome','estoque','estoqueVitrine','estoqueGalpao','precoBRL','custoBRL','inativadoEm'])
  assert.deepEqual(p.lista[0][campo],produto[campo],campo);
 assert.equal(p.lista[0].ativo,true);
 assert.equal(produto.ativo,false);
});
test('cadastro que já está ativo não recebe alteração',()=>{
 const a=diag({catalogoAtual:[{...produto,ativo:true}]});
 assert.equal(a.status,'original_ativo');
 assert.equal(prepararReativacaoOriginal({diagnostico:a,ownerId:id,catalogo:[produto]}).ok,false);
});
test('índice órfão não pode criar um pneu nem copiar estoque V1',()=>{
 const r=diag({catalogoAtual:[],catalogoLegado:[produto]});
 assert.equal(r.status,'somente_legado');
 assert.equal('produtoAtual' in r,false);
 assert.equal(prepararReativacaoOriginal({diagnostico:r,ownerId:id,catalogo:[]}).ok,false);
 const semV1=diag({catalogoAtual:[]});
 assert.equal(semV1.status,'indice_sem_cadastro');
});
test('V2 tombstone exige revisão e não reativa',()=>{
 const r=diag({catalogoAtual:[],modoV2:true,registroV2:{deleted:true,data:produto}});
 assert.equal(r.status,'removido_v2');
 assert.equal(prepararReativacaoOriginal({diagnostico:r,ownerId:id,catalogo:[]}).ok,false);
});
test('V2 que perdeu entidade contradiz catálogo e bloqueia',()=>{
 assert.equal(diag({modoV2:true,registroV2:null}).status,'divergencia_v2');
 const valid=diag({modoV2:true,registroV2:{deleted:false,data:produto}});
 assert.equal(valid.status,'original_inativo');
});
test('não ativa se outro registro tomou SKU, se índice sumiu ou ID duplicou',()=>{
 const dupe={...produto,id:other};
 const bad=diag({catalogoAtual:[produto,dupe]});
 assert.equal(bad.status,'conflito');
 assert.equal(prepararReativacaoOriginal({diagnostico:bad,ownerId:id,catalogo:[produto,dupe]}).ok,false);
 assert.equal(diag({indices:[]}).status,'inconclusivo');
 assert.equal(diag({catalogoAtual:[produto,{...produto}]}).status,'conflito');
});
test('mudança concorrente de status bloqueia após consulta inicial',()=>{
 const r=diag({});
 assert.equal(prepararReativacaoOriginal({diagnostico:r,ownerId:id,catalogo:[{...produto,ativo:true}]}).ok,false);
});
