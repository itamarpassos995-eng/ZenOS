// Gate sem credenciais, sem rede e sem Firebase real.
// Comprova que a versão de homologação NÃO compila sem SDK isolado.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const read=p=>readFileSync(resolve(root,p),'utf8');
const project='zenos-commerce-homologacao';
const safeSDK={projectId:project,authDomain:project+'.firebaseapp.com',
 storageBucket:project+'.firebasestorage.app',apiKey:'local-test-no-network',appId:'1:000000000000:web:local-test'};
const rootEnv={...process.env,CI:'true'};
const vite=resolve(root,'node_modules/vite/bin/vite.js');
const tmp=mkdtempSync(join(tmpdir(),'zenos-commerce-hml-guard-'));
const cmd=(cfg,bridge='false',mode='commerce-hml')=>spawnSync(process.execPath,[vite,'build','--mode',mode,'--outDir',tmp],
 {cwd:root,encoding:'utf8',env:{...rootEnv,VITE_ZENOS_COMMERCE_HML_FIREBASE_CONFIG:cfg,VITE_ZENOS_COMMERCE_OPERATOR_BRIDGE:bridge}});
try {
 const main=read('src/main.jsx');
 assert.match(main,/import\.meta\.env\.MODE==='commerce-hml'/);
 assert.match(main,/commerceBuildIncompleto/);
 assert.ok(main.indexOf('commerceBuildIncompleto')<main.indexOf('? <ZenCommerceStorefront'));
 const deploy=read('scripts/commerce-cloud-hml-deploy.mjs');
 assert.match(deploy,/const project='zenos-commerce-homologacao'/);
 assert.match(deploy,/functions:fiscal:commerceSessaoZenOS/);
 assert.match(deploy,/firebase\.commerce\.cloud-hml\.json/);
 assert.doesNotMatch(deploy,/--project.*zenos-ac6b2/);
 const firebase=JSON.parse(read('firebase.commerce.cloud-hml.json'));
 assert.equal(firebase.firestore.rules,'firestore.commerce.cloud-hml.rules');
 assert.equal(firebase.storage.rules,'storage.commerce.cloud-hml.rules');
 assert.equal(firebase.hosting.public,'dist-commerce-hml');
 for(const file of [firebase.firestore.rules,firebase.storage.rules]){
  const r=read(file).replace(/\/\/.*$/gm,'');
  assert.equal((r.match(/\ballow\b/g)||[]).length,1);
  assert.match(r,/allow read, write: if false;/);
 }
 for(const cfg of ['{invalid-json',JSON.stringify({...safeSDK,projectId:'zenos-ac6b2'}),
   JSON.stringify({...safeSDK,storageBucket:'zenos-ac6b2.firebasestorage.app'})]){
  const run=cmd(cfg);assert.notEqual(run.status,0,'Build HML inseguro não poderia compilar.');
  assert.match(run.stderr+run.stdout,/Build Commerce bloqueado/);
 }
 const unsafe=cmd(JSON.stringify(safeSDK),'true');
 assert.notEqual(unsafe.status,0,'HML jamais pode habilitar a ponte operacional.');
 assert.match(unsafe.stderr+unsafe.stdout,/ponte operacional/);
 // Shell completo do ZenOS: somente o modo operacional HML pode ligar a ponte
 // e só pode apontar ao projeto isolado e ao domínio Auth esperado.
 const runtime=read('src/core/runtimeEnvironment.js');
 const firebaseJs=read('src/firebase.js');
 const entry=read('src/main.jsx');
 assert.match(runtime,/isCloudCommerceHml: cloudCommerceHml/);
 assert.match(firebaseJs,/ZENOS_RUNTIME\.isCloudCommerceHml\s*\?\s*obterOpcoesFirebaseCommerce\(\)/);
 assert.match(firebaseJs,/ZENOS_RUNTIME\.isHomologacao && !ZENOS_RUNTIME\.isCloudCommerceHml/);
 assert.match(entry,/commerceOperationalHml\?<ZenCommerceOperationalHmlGate><App \/><\/ZenCommerceOperationalHmlGate>/);
 assert.match(entry,/React\.lazy\(\(\)=>import\('\.\/components\/ZenCommerceOperationalHmlGate\.jsx'\)\)/);
 assert.doesNotMatch(entry,/^import ZenCommerceOperationalHmlGate from/m);

 const rules=read('firestore.commerce.operational-hml.rules');
 assert.match(rules,/request\.auth\.uid == lojaId/);
 assert.match(rules,/homologacao_operacional/);
 assert.match(rules,/email_verified == true/);
 assert.match(rules,/request\.auth\.token\.email == 'itamarbenit@gmail.com'/);
 assert.match(rules,/allow update,delete: if false/);
 assert.doesNotMatch(rules,/allow read, write: if true/);
 for(const [cfg,bridge] of [
  ['{invalid-json','true'],
  [JSON.stringify({...safeSDK,projectId:'zenos-ac6b2'}),'true'],
  [JSON.stringify({...safeSDK,authDomain:'zenos-ac6b2.firebaseapp.com'}),'true'],
  [JSON.stringify(safeSDK),'false'],
 ]){
  const rejected=cmd(cfg,bridge,'commerce-operational-hml');
  assert.notEqual(rejected.status,0,'Build operacional inseguro jamais pode compilar.');
  assert.match(rejected.stderr+rejected.stdout,/Build Commerce/);
 }
 const operational=cmd(JSON.stringify(safeSDK),'true','commerce-operational-hml');
 if(operational.status!==0)throw Error('Build HML operacional falhou:\\n'+operational.stdout.slice(-1200)+'\\n'+operational.stderr.slice(-2000));
 assert.ok(readdirSync(tmp).includes('index.html'),'Build operacional não gerou index.');
 const valid=cmd(JSON.stringify(safeSDK));
 if(valid.status!==0)throw Error('Build seguro falhou:\n'+valid.stdout.slice(-1200)+'\n'+valid.stderr.slice(-2000));
 assert.ok(readdirSync(tmp).includes('index.html'),'HTML de homologação não gerado.');
 assert.ok(readdirSync(join(tmp,'assets')).length>0,'Assets da homologação não gerados.');
 console.log('PASSOU: build HML + shell operacional isolado: SDK/projeto/ponte protegidos, regras segregadas, compilação offline válida.');
}finally{rmSync(tmp,{recursive:true,force:true});}
