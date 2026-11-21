import test from 'node:test';
import assert from 'node:assert/strict';
import {apurarPrecoProdutoNativo,produtoParaFormularioMonetario} from '../src/core/productMoney.js';
import {VIPE_STORE_ID} from '../src/core/vipeLegacyNative.js';
const vipe=VIPE_STORE_ID;
const rates={PYG:1150,USD:0.20};
const get=(p,field='precoBRL',id=vipe,fx=rates)=>apurarPrecoProdutoNativo(p,field,'PYG',fx,id);
test('VIPE legacy small BRL-scale prices are read as fixed PYG, never saved in bulk',()=>{
 for(const [raw,want] of [[35,'40250'],[43,'49450'],[452,'519800'],[9,'10350']]){
   const p=Object.freeze({precoBRL:raw,custoBRL:27667});
   assert.equal(get(p).valorMinor,want);
   assert.equal(get(p,'custoBRL').valorMinor,'27667');
   assert.equal(get(p,'precoBRL',vipe,{PYG:2000,USD:0.50}).valorMinor,want);
   assert.equal(p.precoBRL,raw);
 }
});
test('VIPE PYG prices in thousands are not converted or repriced on FX changes',()=>{
 const p={precoBRL:85000,custoBRL:63749};
 assert.equal(get(p).valorMinor,'85000');
 assert.equal(get(p,'precoBRL',vipe,{PYG:1500}).valorMinor,'85000');
});
test('a clearly native PYG amount remains sovereign',()=>{
 const p={precoBRL:35,custoBRL:27,valoresMonetarios:{versao:1,campos:{
  custoBRL:{valor:27,moeda:'PYG'},precoBRL:{valor:35000,moeda:'PYG'}}}};
 assert.equal(get(p).valorMinor,'35000');
});
test('corrupt tiny PYG snapshot below independently declared cost is reconciled only for VIPE',()=>{
 const p={precoBRL:35,custoBRL:27,valoresMonetarios:{versao:1,campos:{
  custoBRL:{valor:27667,moeda:'PYG'},precoBRL:{valor:35,moeda:'PYG'}}}};
 assert.equal(get(p).valorMinor,'40250');
 assert.equal(get(p,'precoBRL','OTHER').valorMinor,'35');
});
test('small legitimate PYG item with matching low PYG cost remains unchanged',()=>{
 const p={precoBRL:100,valoresMonetarios:{versao:1,campos:{
  custoBRL:{valor:65,moeda:'PYG'},precoBRL:{valor:100,moeda:'PYG'}}}};
 assert.equal(get(p).valorMinor,'100');
});
test('other tenant never uses VIPE historical multiplier',()=>{
 const p={precoBRL:35};
 assert.equal(get(p,'precoBRL','ANOTHER_STORE').valorMinor,null);
 assert.equal(get(p,'precoBRL','ANOTHER_STORE').status,'pendente_origem');
});
test('VIPE editor shows recovered native price without changing input product object',()=>{
 const p=Object.freeze({precoBRL:35,custoBRL:27667});
 const form=produtoParaFormularioMonetario(p,'PYG',()=>50000,vipe,'PYG');
 assert.equal(form.precoBRL,'40250');
 assert.equal(form.custoBRL,'27667');
 assert.equal(p.precoBRL,35);
});

test('editing an unrelated field never silently rewrites damaged legacy price',async()=>{
 const {registrarValoresProduto}=await import('../src/core/productMoney.js');
 const p={nome:'Old name',precoBRL:35,custoBRL:27667,preco2BRL:0,preco3BRL:0};
 const form=produtoParaFormularioMonetario(p,'PYG',(v)=>v*1150,vipe,'PYG');
 const saved=registrarValoresProduto({...form},'PYG',(v)=>v/1150,p,(v)=>v*1150,vipe);
 assert.equal(saved.precoBRL,35);
 assert.equal(saved.custoBRL,27667);
 assert.equal(saved.valoresMonetarios.campos.precoBRL,undefined);
});
