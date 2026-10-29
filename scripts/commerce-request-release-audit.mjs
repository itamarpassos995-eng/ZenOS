#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const run=(args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
let changed;
try{changed=run(['diff','--name-only','origin/main...HEAD']).split('\n').filter(Boolean);}catch(e){console.error('GATE_FAIL: não foi possível comparar com origin/main.');process.exit(2);}
const allowed=new Set([
  'src/App.jsx','src/components/CommerceSolicitacao.jsx','src/components/CommerceSolicitacao.css',
  'src/core/commerceConfig.js',
  'src/main.jsx','src/components/CommerceVitrinePreview.jsx','src/components/CommerceVitrinePreview.css',
  'src/commerce.css','src/components/CommerceDialog.jsx','src/components/ZenCommerceStorefront.jsx',
  'public/demo-mademoiselle-elegance.png',
  'scripts/recovery/commerce-preview.ui.test.jsx','vercel.json',
  'functions/src/index.js','functions/src/commerceInteresseCore.js',
  'functions/src/commerceSolicitacaoCliente.js','functions/test/commerceInteresseCore.test.mjs',
  'scripts/recovery/commerce-request.ui.test.jsx',
  'scripts/commerce-request-release-audit.mjs',
  '.github/workflows/commerce-request-only-ci.yml',
  'docs/commerce-request-only-release-20261019.md',
  '.github/workflows/deploy-fiscal-functions.yml',
  // Homologação CDN: somente novos arquivos isolados, sob gate própria de testes.
  '.github/workflows/commerce-cdn-homologacao-ci.yml',
  'api/commerce/_lib/commerceGoogle.js','api/commerce/catalogo.js',
  'api/commerce/publicar.js','api/commerce/pedido.js',
  'commerce-homologacao.html','vite.config.js',
  'src/commerce-homologacao-main.jsx','src/core/commerceCdnClient.js',
  'src/core/commercePublicCatalog.js','docs/ARQUITETURA_COMMERCE_PUBLICO.md',
  'scripts/commerce-cdn-api.test.mjs','scripts/commerce-cdn-client.test.mjs',
  'scripts/commerce-cdn-homologacao.test.mjs','scripts/commerce-cdn-pedido.test.mjs',
  'scripts/commerce-cdn-preview.test.mjs','scripts/commerce-cdn-publicar.test.mjs',
]);
assert.ok(changed.every(p=>allowed.has(p)),'GATE_FAIL: alteração fora do pacote de solicitação: '+changed.filter(x=>!allowed.has(x)).join(', '));
const read=path=>fs.readFileSync(path,'utf8');
const mainIdx=run(['show','origin/main:functions/src/index.js']).trim();
const current=read('functions/src/index.js').trim();
const commerceExport="export { commerceSolicitacaoCliente } from './commerceSolicitacaoCliente.js';";
const expectedIndex=mainIdx.includes(commerceExport)?mainIdx:mainIdx+"\n"+commerceExport;
assert.equal(current,expectedIndex,
 'GATE_FAIL: alterações inesperadas na entrada das funções fiscais');
const appBefore=run(['show','origin/main:src/App.jsx']);
const appAfter=read('src/App.jsx');
for(const marker of [
 "persistV1OperationFieldSafe","persistV1BusinessOperationSafe","onSnapshot","commitVendaCritica",
 "commitOperacaoCritica","ecraAtual === 'pdv'","ecraAtual === 'fiscal'",
]){
 assert.ok(appBefore.includes(marker)&&appAfter.includes(marker),'GATE_FAIL: operação protegida ausente: '+marker);
}
const forbiddenFiles=['src/firebase.js','src/core/productionSync.js','src/core/operationalRepository.js',
 'src/components/PDV.jsx','src/components/Clientes.jsx','src/components/Fiscal.jsx',
 'functions/src/fiscalSolicitacaoCliente.js','functions/src/fiscalAdministracao.js','functions/src/firebaseAdmin.js',
 'firestore.emulator.rules','firebase.json'];
assert.ok(forbiddenFiles.every(p=>!changed.includes(p)),'GATE_FAIL: arquivo operacional ou Firebase alterado.');
const svc=read('functions/src/commerceSolicitacaoCliente.js');
assert.ok(svc.includes("if(criar)tx.create(ref,doc)")&&svc.includes("action==='consultar'")&&svc.includes("resolverLoja")===false);
const request=read('functions/src/commerceInteresseCore.js');
assert.ok(request.includes("habilitado:false")&&request.includes("WRONG_TENANT")&&!request.includes("tx.update"));
const portal=read('src/components/CommerceSolicitacao.jsx');
assert.ok(portal.includes("Solicitar Ativação do Módulo")&&portal.includes("commerceSolicitacaoCliente"),
  'GATE_FAIL: solicitação de ativação do módulo ausente');
assert.ok(portal.includes("auth.currentUser?.uid !== lojaId")&&portal.includes("commerceConfig: configNormalizada")&&portal.includes("{ merge: true }"),
  'GATE_FAIL: gravação de configurações sem isolamento da loja ou sem merge');
const config=read('src/core/commerceConfig.js');
assert.ok(config.includes('chaveCommerceConfigLocal')&&config.includes('normalizarCommerceConfig'),
  'GATE_FAIL: configuração Commerce sem isolamento local por loja');
const preview=read('src/components/CommerceVitrinePreview.jsx');
assert.ok(preview.includes('const souDono = Boolean(usuario && !usuario.isAnonymous && usuario.uid === idDaLoja)')&&
  preview.includes('if (!ehProprietario)')&&preview.includes('isLivePreview={false}')&&
  preview.includes('isLivePreview={true}')&&
  preview.includes("getDoc(doc(db, 'lojas', idDaLoja, 'dados', 'configuracoes'))")&&
  !preview.includes('setDoc(')&&!preview.includes('httpsCallable('),
  'GATE_FAIL: prévia privada/vitrine pública sem isolamento por loja ou com operações de escrita/ativação');
const scrollCss=read('src/components/CommerceSolicitacao.css');
assert.ok(scrollCss.includes('.commerce-preview-column .commerce-premium-scroll')&&
  scrollCss.includes('overscroll-behavior-y: auto')&&
  portal.includes('commerce-mockup-screen commerce-premium-scroll')&&
  preview.includes("classList.add('commerce-document')"),
  'GATE_FAIL: rolagem da vitrine bloqueada ou fora do escopo Commerce');
const storefront=read('src/components/ZenCommerceStorefront.jsx');
assert.ok(preview.includes('isLivePreview={true}')&&portal.includes('isLivePreview={true}')&&
  storefront.includes('if (isLivePreview || busy) return;')&&
  storefront.includes('if (isLivePreview) return;')&&
  storefront.includes('disabled={isLivePreview || !p.disponivel}')&&
  storefront.includes('{!isLivePreview && aberto && (')&&
  storefront.includes("if (idPublico && idPublico !== 'previa')")&&
  storefront.includes("await setDoc(doc(db, 'lojas', String(idPublico), 'pedidos_online', idPedido), pedidoDoc);")&&
  !/\b(?:updateDoc|httpsCallable|chamarLojaCommerce|criarCheckoutCommerce)\b/.test(storefront),
  'GATE_FAIL: prévia com carrinho/checkout ou pedido público fora do escopo da loja');
const main=read('src/main.jsx');
assert.ok(main.includes('CommerceVitrinePreview')&&main.includes('previewMatch'),
  'GATE_FAIL: rota isolada da prévia ausente');
assert.deepEqual(JSON.parse(read('vercel.json')).rewrites,
  [
    {source:'/vitrine/:lojaId',destination:'/commerce-homologacao.html'},
    {source:'/loja/:lojaId',destination:'/index.html'}
  ],
  'GATE_FAIL: rotas fora do escopo do catálogo CDN ou rota privada Commerce modificada');
console.log('COMMERCE_REQUEST_AND_SETTINGS_GATE_OK: módulos V1/V2, PDV, fiscal, regras, Auth e caixas intactos.');
console.log('NOT_DEPLOYED: função e interface exigem deploy controlado em duas etapas.');
