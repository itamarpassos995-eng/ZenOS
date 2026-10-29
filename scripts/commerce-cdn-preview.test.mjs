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
 assert.match(main,/isLivePreview=\{true\}/);
 assert.match(main,/carregarCatalogoPublico/);
 assert.doesNotMatch(main,/from ['"].*firebase/);
 assert.doesNotMatch(main,/App.jsx|onAuthStateChanged|onSnapshot|signInAnonymously/);
 assert.doesNotMatch(store,/^import .*firebase/m);
 assert.match(store,/import\('\.\.\/firebase'\)/);
 assert.match(vite,/commerceHomologacao: resolve\(process.cwd\(\), 'commerce-homologacao.html'\)/);
});
