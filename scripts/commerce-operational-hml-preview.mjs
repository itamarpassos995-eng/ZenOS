/**
 * Ferramenta cirúrgica do canal de prévia do PDV fictício.
 *
 * --check            Sem rede, sem credenciais, sem gravação.
 * --build            Compila apenas com SDK do Firebase HML.
 * --publish-preview  Publica SOMENTE um canal temporário no Hosting HML.
 *
 * NÃO publica firestore:rules, Storage, Functions, Auth ou Hosting live.
 */
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const project='zenos-commerce-homologacao';
const bucket='zenos-commerce-homologacao.firebasestorage.app';
const domain='zenos-commerce-homologacao.firebaseapp.com';
const account='itamarbenit@gmail.com';
const configName='firebase.commerce.operational-preview.json';
const publicDir='dist-commerce-operational-hml';
const channel='operacional-interno-20261019';
const args=process.argv.slice(2);
const action=args[0];
if(args.length!==1||!['--check','--build','--publish-preview'].includes(action))
 throw Error('Ação inválida. Opções: --check, --build e --publish-preview.');
for(const name of ['GCLOUD_PROJECT','GCP_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID']){
 const v=process.env[name];
 if(v&&v!==project)throw Error('Projeto inseguro identificado em '+name+'. Operação bloqueada.');
}
const cfg=JSON.parse(readFileSync(resolve(root,configName),'utf8'));
const expectedKeys=JSON.stringify(['hosting']);
if(JSON.stringify(Object.keys(cfg).sort())!==expectedKeys||
   cfg.hosting?.public!==publicDir||!Array.isArray(cfg.hosting.rewrites)||
   cfg.hosting.rewrites.length!==1||
   cfg.hosting.rewrites[0]?.source!=='**'||
   cfg.hosting.rewrites[0]?.destination!=='/index.html'||
   cfg.hosting?.site||cfg.hosting?.target||
   cfg.hosting?.predeploy||cfg.hosting?.postdeploy)
 throw Error('Configuração de prévia não é exclusivamente Hosting isolado.');
const src=readFileSync(resolve(root,'src/main.jsx'),'utf8');
if(!src.includes("import.meta.env.MODE==='commerce-operational-hml'")||
   !src.includes('<ZenCommerceOperationalHmlGate><App /></ZenCommerceOperationalHmlGate>'))
 throw Error('Entrada do shell operacional não comprovada.');
const rulesCloud=JSON.parse(readFileSync(resolve(root,'firebase.commerce.cloud-hml.json'),'utf8'));
if(rulesCloud.firestore?.rules!=='firestore.commerce.cloud-hml.rules')
 throw Error('Não alterar a configuração das regras atuais da homologação.');
function sdkExato(){
 let json=process.env.VITE_ZENOS_COMMERCE_HML_FIREBASE_CONFIG;
 if(!json){
  const p=resolve(root,'.env.commerce-hml.local');
  if(existsSync(p)){
   const txt=readFileSync(p,'utf8');
   const line=txt.split(/\r?\n/).find(v=>v.startsWith('VITE_ZENOS_COMMERCE_HML_FIREBASE_CONFIG='));
   if(line)json=line.slice('VITE_ZENOS_COMMERCE_HML_FIREBASE_CONFIG='.length).trim().replace(/^['"]|['"]$/g,'');
  }
 }
 let sdk;try{sdk=JSON.parse(json||'')}catch{throw Error('SDK HML ausente ou inválido; obtenha configuração pública do projeto isolado.');}
 if(sdk.projectId!==project||sdk.storageBucket!==bucket||sdk.authDomain!==domain||
    typeof sdk.appId!=='string'||!sdk.appId||
    typeof sdk.apiKey!=='string'||!sdk.apiKey)
  throw Error('SDK não pertence à homologação isolada.');
 return JSON.stringify(sdk);
}
const vite=resolve(root,'node_modules/vite/bin/vite.js');
const cli=(...params)=>{
 const argv=['-y','firebase-tools@15.34.0',...params];
 const child=process.platform==='win32'
  ?spawnSync('cmd.exe',['/d','/s','/c','npx.cmd '+argv.join(' ')],{cwd:root,stdio:'inherit'})
  :spawnSync('npx',argv,{cwd:root,stdio:'inherit'});
 if(child.error)throw child.error;
 if(child.status!==0)throw Error('Firebase CLI falhou com código '+child.status+'. Nenhuma atualização de produção foi solicitada.');
};
console.log('CHECK HML: '+project+' — arquivo Hosting-only; regras/functions/Auth fora do escopo.');
if(action==='--check'){
 console.log('PASSOU: prévia interna limitada ao Hosting, sem modificar live, regras, funções ou produção.');
 process.exit(0);
}
const sdk=sdkExato();
if(!existsSync(vite))throw Error('Execute npm ci antes de compilar a prévia.');
const build=spawnSync(process.execPath,[vite,'build','--mode','commerce-operational-hml','--outDir',publicDir],
 {cwd:root,stdio:'inherit',env:{...process.env,VITE_ZENOS_COMMERCE_HML_FIREBASE_CONFIG:sdk,
   VITE_ZENOS_COMMERCE_OPERATOR_BRIDGE:'true'}});
if(build.error)throw build.error;
if(build.status!==0)throw Error('Build operacional recusado; nenhuma publicação foi realizada.');
if(!existsSync(resolve(root,publicDir,'index.html'))||
   !readdirSync(resolve(root,publicDir,'assets')).length)
 throw Error('Artefato de prévia incompleto; publicação bloqueada.');
console.log('PASSOU: build operacional com SDK do projeto isolado. Artefato: '+publicDir);
if(action==='--build')process.exit(0);
console.log('Iniciando canal de prévia por 7 dias. O canal live NÃO será atualizado.');
cli('hosting:channel:deploy',channel,'--project',project,'--account',account,
    '--config',configName,'--expires','7d','--non-interactive');
console.log('Prévia HML criada. URL exata está na saída do Firebase CLI; verifique domínio e acesso Google.');
