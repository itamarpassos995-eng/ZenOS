import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepararBannerCommerce,caminhoBannerValido,caminhoCommerceValido} from '../src/commerceMediaServiceCore.js';
import {validarRascunhoCommerce} from '../src/commerceStudioCore.js';
const webp='UklGRmIAAABXRUJQVlA4IFYAAACwBgCdASp4AHgAPm02mUmkIyKhIIgAgA2JaW7hdJlwAAE9tiLxBUc9sReIKjntiLxBUc9sReIKjntiLxBNgAD+/paf//tTBJGUv//dBlnDdIAAAAAAAA==';
const plano=prepararBannerCommerce({lojaId:'loja-a',bannerId:'b-1',tipo:'desktop',principalBase64:webp,miniaturaBase64:webp});
test('banner usa namespace próprio e rejeita referências cruzadas',()=>{
 assert.ok(caminhoBannerValido(plano.path,'loja-a','b-1','desktop'));
 for(const [loja,banner,tipo] of [['loja-b','b-1','desktop'],['loja-a','b-2','desktop'],['loja-a','b-1','mobile']])assert.equal(caminhoBannerValido(plano.path,loja,banner,tipo),false);
 assert.equal(caminhoCommerceValido(plano.path,'loja-a','b-1'),false);
 assert.throws(()=>prepararBannerCommerce({lojaId:'loja-a',bannerId:'../x',principalBase64:webp,miniaturaBase64:webp}));
});
test('rascunho guarda caminho autorizado e descarta URL temporária do banner',()=>{
 const dados={aparencia:{banners:[{id:'b-1',imagemDesktopStoragePath:plano.path,imagemDesktop:'https://example.com/temporaria'}]},regras:{}};
 const limpo=validarRascunhoCommerce(dados,'loja-a');
 assert.equal(limpo.aparencia.banners[0].imagemDesktop,'');assert.equal(limpo.aparencia.banners[0].imagemDesktopStoragePath,plano.path);
 assert.throws(()=>validarRascunhoCommerce(dados,'loja-b'),/outra loja/);
 assert.throws(()=>validarRascunhoCommerce({...dados,aparencia:{banners:[{id:'b-1',imagemMobileStoragePath:plano.path}]}},'loja-a'),/formato/);
});
