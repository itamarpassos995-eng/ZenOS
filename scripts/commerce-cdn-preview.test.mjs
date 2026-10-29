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
  {source:'/vitrine/:lojaId',destination:'/commerce-homologacao.html'},
  {source:'/loja/:lojaId',destination:'/index.html'}
 ]);
 const src=readFileSync('src/components/ZenCommerceStorefront.jsx','utf8');
 assert.match(src,/checkoutViaWhatsApp = false/);
 assert.match(src,/if \(checkoutViaWhatsApp\) \{/);
 assert.match(src,/Este pedido não foi registrado automaticamente no PDV/);
 const publicPage=readFileSync('src/commerce-homologacao-main.jsx','utf8');
 assert.match(publicPage,/VITE_ZENOS_CDN_WHATSAPP_CHECKOUT/);
 assert.match(publicPage,/checkoutViaWhatsApp=/);
});
