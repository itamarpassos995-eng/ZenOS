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
const cmd=(cfg,bridge='false')=>spawnSync(process.execPath,[vite,'build','--mode','commerce-hml','--outDir',tmp],
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
 const valid=cmd(JSON.stringify(safeSDK));
 if(valid.status!==0)throw Error('Build seguro falhou:\n'+valid.stdout.slice(-1200)+'\n'+valid.stderr.slice(-2000));
 assert.ok(readdirSync(tmp).includes('index.html'),'HTML de homologação não gerado.');
 assert.ok(readdirSync(join(tmp,'assets')).length>0,'Assets da homologação não gerados.');
 console.log('PASSOU: build HML isolado validado; SDK ausente/inválido, produção e ponte recusados; regras deny-all; artefato offline gerado.');
}finally{rmSync(tmp,{recursive:true,force:true});}
