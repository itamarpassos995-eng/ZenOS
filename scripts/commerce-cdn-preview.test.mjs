import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('preview CDN é entrada independente sem App Firebase Auth ou listeners',()=>{
 const html=readFileSync('commerce-homologacao.html','utf8');
 const main=readFileSync('src/commerce-homologacao-main.jsx','utf8');
 const store=readFileSync('src/components/ZenCommerceStorefront.jsx','utf8');
 const vite=readFileSync('vite.config.js','utf8');
 assert.match(html,/noindex,nofollow/);
 assert.match(html,/src\/commerce-homologacao-main.jsx/);
 assert.match(main,/ZenCommerceStorefront/);
 assert.match(main,/isLivePreview=\{import\.meta\.env\.VITE_ZENOS_CDN_WHATSAPP_CHECKOUT !== 'true'\}/);
 assert.match(main,/carregarCatalogoPublico/);
 assert.doesNotMatch(main,/from ['"].*firebase/);
 assert.doesNotMatch(main,/App.jsx|onAuthStateChanged|onSnapshot|signInAnonymously/);
 assert.doesNotMatch(store,/^import .*firebase/m);
 assert.match(store,/import\('\.\.\/firebase'\)/);
 assert.match(vite,/commerceHomologacao: resolve\(process.cwd\(\), 'commerce-homologacao.html'\)/);
});

test('rota pública alternativa permanece isolada da rota original e só habilita WhatsApp explicitamente',()=>{
 const rules=JSON.parse(readFileSync('vercel.json','utf8'));
 assert.deepEqual(rules.rewrites,[
  {source:'/loja/previa',destination:'/index.html'},
  {source:'/loja/:lojaId',destination:'/commerce-homologacao.html'},
  {source:'/vitrine/:lojaId',destination:'/commerce-homologacao.html'}
 ]);
 const src=readFileSync('src/components/ZenCommerceStorefront.jsx','utf8');
 assert.match(src,/checkoutViaWhatsApp = false/);
 assert.match(src,/if \(checkoutViaWhatsApp\) \{/);
 assert.match(src,/Este pedido não foi registrado automaticamente no PDV/);
 const publicPage=readFileSync('src/commerce-homologacao-main.jsx','utf8');
 assert.match(publicPage,/VITE_ZENOS_CDN_WHATSAPP_CHECKOUT/);
 assert.match(publicPage,/checkoutViaWhatsApp=/);
});

test('link oficial permite apelido editável sem login Firebase para catálogo publicado',()=>{
 const src=readFileSync('src/commerce-homologacao-main.jsx','utf8');
 assert.match(src,/\(\?:loja\|vitrine\)/);
 assert.match(src,/import\('\.\/components\/CommerceVitrinePreview'\)/);
 assert.match(src,/err\?\.message==='loja-nao-publicada'/);
 assert.match(src,/status:'pronto'/);
});

test('loja pública não exibe faixa de homologação e usa cards progressivos',()=>{
 const storefront=readFileSync('src/components/ZenCommerceStorefront.jsx','utf8');
 assert.doesNotMatch(storefront,/HOMOLOGAÇÃO · Esta é uma loja de teste/);
 assert.match(storefront,/filtrados\.slice\(0,quantidadeVisivel\)/);
 assert.match(storefront,/Ver mais produtos/);
 assert.doesNotMatch(storefront,/\.slice\(0, 48\)/);
});

test('painel permite configurar produtos além dos primeiros 100',()=>{
 const admin=readFileSync('src/components/CommerceSolicitacao.jsx','utf8');
 assert.match(admin,/filtrados\.slice\(0, limiteProdutosPainel\)/);
 assert.match(admin,/setLimiteProdutosPainel\(v => v \+ 100\)/);
 assert.match(admin,/Carregar mais produtos/);
 assert.doesNotMatch(admin,/filtrados\.slice\(0, 100\)/);
});
