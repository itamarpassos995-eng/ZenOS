import test from 'node:test';
import assert from 'node:assert/strict';
import {apurarPrecoProdutoNativo,produtoParaFormularioMonetario,registrarValoresProduto} from '../src/core/productMoney.js';
import {VIPE_STORE_ID} from '../src/core/vipeLegacyNative.js';
import {vipeOfficialProduct,precoOficialVipePYG} from '../src/core/vipeOfficialCatalog.js';
import official from '../src/data/vipeOfficialPrices20261031.js';
const vipe=VIPE_STORE_ID;
const rates={PYG:1150,USD:0.2,EUR:0.18};
const migrated=(id,over={})=>({id:'VIPE-PROD-'+id,sku:official.rows[id][0],
  origemMigracao:'VIPE-FPX',idOrigemMigracao:id,precoBRL:35,custoBRL:27667,
  ...over});
const get=(p,f='precoBRL',id=vipe,r=rates)=>apurarPrecoProdutoNativo(p,f,'PYG',r,id);
test('imported VIPE products keep their current stored PYG price without a snapshot',()=>{
 const p=migrated('103',{precoBRL:47000});
 assert.equal(get(p).valorMinor,'47000');
 assert.equal(get(p,'precoBRL',vipe,{...rates,PYG:2500}).valorMinor,'47000');
 assert.equal(p.precoBRL,47000);
});
test('a recataloged native PYG snapshot takes precedence over the old catalog',()=>{
 const p=migrated('103',{valoresMonetarios:{versao:1,campos:{custoBRL:{valor:27667,moeda:'PYG'},precoBRL:{valor:47000,moeda:'PYG'}}}});
 assert.equal(get(p).valorMinor,'47000');
 assert.equal(get(p,'precoBRL',vipe,{...rates,PYG:2500}).valorMinor,'47000');
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
test('imported VIPE editor shows the current registered price and preserves unrelated edits',()=>{
 const p=migrated('103',{precoBRL:47000,preco2BRL:0,preco3BRL:0});
 const original=JSON.stringify(p);
 const form=produtoParaFormularioMonetario(p,'PYG',v=>v*1150,vipe,'PYG');
 assert.equal(form.precoBRL,'47000');
 const saved=registrarValoresProduto(form,'PYG',(v,m)=>m==='PYG'?v/1150:v,p,(v,m)=>m==='PYG'?v*1150:v,vipe);
 assert.equal(saved.precoBRL,47000);
 assert.equal(JSON.stringify(p),original);
});

test('VIPE can edit an imported price and choose its currency on subsequent saves',()=>{
 const toBRL=(value,currency)=>currency==='PYG'?value/1150:value;
 const fromBRL=(value,currency)=>currency==='PYG'?value*1150:value;
 const imported=migrated('103',{precoBRL:40000,preco2BRL:0,preco3BRL:0});
 const open=product=>produtoParaFormularioMonetario(product,'PYG',fromBRL,vipe,'PYG');
 const save=(product,changes)=>({...product,...registrarValoresProduto(
   {...open(product),...changes},'PYG',toBRL,product,fromBRL,vipe
 )});

 assert.equal(open(imported).precoBRL,'40000');
 const updated=save(imported,{precoBRL:'47000'});
 assert.equal(open(updated).precoBRL,'47000');
 assert.equal(get(updated,'precoBRL',vipe,{...rates,PYG:2500}).valorMinor,'47000');

 const inBRL=save(updated,{precoBRL:'42.50',preco2BRL:'0.00',preco3BRL:'0.00',moedaPreco:'BRL'});
 assert.equal(open(inBRL).moedaPreco,'BRL');
 assert.equal(open(inBRL).precoBRL,'42.50');
 assert.equal(get(inBRL,'precoBRL',vipe,{...rates,PYG:2500}).valorOriginalMinor,'4250');
 assert.equal(get(save(inBRL,{precoBRL:'48500',preco2BRL:'0',preco3BRL:'0',moedaPreco:'PYG'})).valorMinor,'48500');
});
