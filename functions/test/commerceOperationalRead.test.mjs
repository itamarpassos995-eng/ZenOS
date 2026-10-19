import {test} from 'node:test';import assert from 'node:assert/strict';
import {rotaOperacionalCommerce,lerProdutosCommerce} from '../src/commerceOperationalRead.js';
const generation='ab'.repeat(12),sourceChecksum='source',certificate={sourceChecksum,productionReady:true,v1WritersFenced:true,finalReconciliationPassed:true,pdvIntegrationPassed:true,rollbackPrepared:true};
const c={mode:'v2',generation,sourceChecksum,certificate};
test('respeita roteamento aprovado e nunca recua V2 inválida para V1',()=>{
 assert.equal(rotaOperacionalCommerce(null),null);assert.equal(rotaOperacionalCommerce({mode:'legacy'}),null);assert.equal(rotaOperacionalCommerce({...c,mode:'shadow'}),null);assert.equal(rotaOperacionalCommerce(c),generation);
 for(const v of [{...c,mode:'maintenance'},{...c,certificate:{}},{...c,generation:'../x'},{mode:'desconhecido'}])assert.throws(()=>rotaOperacionalCommerce(v));
 for(const key of Object.keys(certificate))assert.throws(()=>rotaOperacionalCommerce({...c,certificate:{...certificate,[key]:false}}));
});
test('preço e saldo vêm da V2 certificada; tombstone não reaparece; leitor só faz gets',async()=>{
 const root=`lojas/A/v2_generations/${generation}`;
 const records={
  'lojas/A/dados/storage_control':c,
  [root]:{schema:2,state:'ready',sourceChecksum,fieldManifest:{produtos:{kind:'array',collection:'produtos',count:1}},fieldCounts:{produtos:1}},
  [root+'/produtos/P1']:{legacyField:'produtos',data:{id:'P1',precoBRL:27,estoque:3},deleted:false},
  [root+'/produtos/P2']:{legacyField:'produtos',data:{id:'P2',precoBRL:90},deleted:true},
  'lojas/A/dados/operacao':{produtos:[{id:'P1',precoBRL:1,estoque:100}]},
 };
 const paths=[];const db={doc:path=>path};const tx={get:async path=>{paths.push(path);return {id:path.split('/').at(-1),exists:records[path]!==undefined,data:()=>records[path]};}};
 const produtos=await lerProdutosCommerce(db,'A',tx,{ids:['P1','P2','ausente']});
 assert.deepEqual(produtos,[{id:'P1',precoBRL:27,estoque:3}]);assert.ok(!paths.includes('lojas/A/dados/operacao'));
 records[root].state='copying';await assert.rejects(lerProdutosCommerce(db,'A',tx,{ids:['P1']}));
});
