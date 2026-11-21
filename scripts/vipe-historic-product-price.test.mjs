import test from 'node:test';
import assert from 'node:assert/strict';
import {apurarPrecoProdutoNativo,produtoParaFormularioMonetario,registrarValoresProduto} from '../src/core/productMoney.js';
import {VIPE_STORE_ID} from '../src/core/vipeLegacyNative.js';
import {vipeOfficialProduct,precoOficialVipePYG} from '../src/core/vipeOfficialCatalog.js';
import official from '../src/data/vipeOfficialPrices20261031.json' with {type:'json'};
const vipe=VIPE_STORE_ID;
const rates={PYG:1150,USD:0.2,EUR:0.18};
const migrated=(id,over={})=>({id:'VIPE-PROD-'+id,sku:official.rows[id][0],
  origemMigracao:'VIPE-FPX',idOrigemMigracao:id,precoBRL:35,custoBRL:27667,
  ...over});
const get=(p,f='precoBRL',id=vipe,r=rates)=>apurarPrecoProdutoNativo(p,f,'PYG',r,id);
test('migrated VIPE products recover exact original prices, not 1150 heuristics',()=>{
 for(const [id,want] of [['195',10000],['103',40000],['320',50000],['186',40000],['84',60000],['370',520000]]){
  const p=migrated(id);
  assert.equal(get(p).valorMinor,String(want));
  assert.equal(get(p,'precoBRL',vipe,{...rates,PYG:2500}).valorMinor,String(want));
  assert.equal(p.precoBRL,35);
 }
});
test('original migration snapshot corrupted at 35 never overrides CSV value',()=>{
 const p=migrated('103',{valoresMonetarios:{versao:1,campos:{custoBRL:{valor:27667,moeda:'PYG'},precoBRL:{valor:35,moeda:'PYG'}}}});
 assert.equal(get(p).valorMinor,'40000');
 assert.equal(get(p,'custoBRL').valorMinor,'27667');
});
test('only exact imported ID AND SKU AND tenant/default currency match',()=>{
 const p=migrated('103');
 assert.equal(precoOficialVipePYG(p,'precoBRL',vipe,'PYG'),40000);
 assert.equal(vipeOfficialProduct({...p,sku:'DIFERENTE'},vipe,'PYG'),null);
 assert.equal(vipeOfficialProduct({...p,origemMigracao:'MANUAL'},vipe,'PYG'),null);
 assert.equal(vipeOfficialProduct({...p,idOrigemMigracao:'320'},vipe,'PYG'),null);
 assert.equal(vipeOfficialProduct({...p,id:'PROD-BALCAO-103'},vipe,'PYG'),null);
 assert.equal(vipeOfficialProduct(p,'OTHER','PYG'),null);
 assert.equal(vipeOfficialProduct(p,vipe,'BRL'),null);
 assert.equal(precoOficialVipePYG(p,'preco2BRL',vipe,'PYG'),null);
});
test('later-created VIPE products keep their registered PYG number, including small prices',()=>{
 const newProduct={id:'PROD-BALCAO-NEW',sku:official.rows['103'][0],precoBRL:35,custoBRL:12};
 assert.equal(get(newProduct).valorMinor,'35');
 assert.equal(get(newProduct,'precoBRL',vipe,{...rates,PYG:3000}).valorMinor,'35');
 const snapshot={...newProduct,valoresMonetarios:{versao:1,campos:{precoBRL:{valor:35,moeda:'PYG'}}}};
 assert.equal(get(snapshot).valorMinor,'35');
});
test('a different store never reclassifies its own BRL records as VIPE prices',()=>{
 const p=migrated('103',{valoresMonetarios:{versao:1,campos:{precoBRL:{valor:35,moeda:'BRL'}}}});
 assert.equal(get(p,'precoBRL','OTHER').valorMinor,null);
 assert.equal(apurarPrecoProdutoNativo(p,'precoBRL','BRL',rates,'OTHER').valorMinor,'3500');
});
test('imported VIPE editor shows source price and preserves unrelated edits',()=>{
 const p=migrated('103',{preco2BRL:0,preco3BRL:0});
 const original=JSON.stringify(p);
 const form=produtoParaFormularioMonetario(p,'PYG',v=>v*1150,vipe,'PYG');
 assert.equal(form.precoBRL,'40000');
 const saved=registrarValoresProduto(form,'PYG',(v,m)=>m==='PYG'?v/1150:v,p,(v,m)=>m==='PYG'?v*1150:v,vipe);
 assert.equal(saved.precoBRL,35);
 assert.equal(JSON.stringify(p),original);
 assert.throws(()=>registrarValoresProduto({...form,precoBRL:'50000'},'PYG',(v,m)=>v/1150,p,v=>v*1150,vipe),/preço oficial/);
});
