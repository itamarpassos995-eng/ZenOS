/**
 * Publicação INDIVIDUAL da callable de seed fictícia na homologação.
 * Não publica regras, Auth, Storage nem Hosting. Padrão: verificar e sair.
 */
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const project='zenos-commerce-homologacao';
const account='itamarbenit@gmail.com';
const args=process.argv.slice(2);
if(args.length!==1||!['--check','--deploy-seed'].includes(args[0]))
 throw Error('Ação não reconhecida. Somente --check ou --deploy-seed.');
for(const name of ['GCLOUD_PROJECT','GCP_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID']){
 if(process.env[name]&&process.env[name]!==project)
  throw Error('Destino não corresponde à HML: '+name+'. Bloqueado.');
}
const file=n=>readFileSync(resolve(root,n),'utf8');
const config=JSON.parse(file('firebase.commerce.cloud-hml.json'));
if(config.functions?.codebase!=='fiscal'||config.functions?.source!=='functions'||
   config.firestore?.rules!=='firestore.commerce.cloud-hml.rules'||
   config.hosting?.public!=='dist-commerce-hml')
 throw Error('Configuração cloud HML inesperada.');
if(!file('functions/src/index.js').includes("export {commerceHmlOperationalSeed} from './commerceHmlOperationalSeed.js';")||
   !file('functions/src/commerceHmlOperationalSeed.js').includes('authorizedOperationalHml(process.env,request.auth)')||
   !file('functions/src/commerceHmlOperationalCore.js').includes("env.GCLOUD_PROJECT==='zenos-commerce-homologacao'"))
 throw Error('Function seed não contém as verificações obrigatórias. Bloqueado.');
const target='functions:fiscal:commerceHmlOperationalSeed';
console.log('PASSOU: callable '+target+' restrita a '+project+'; sem edição de regras, Storage, Auth ou Hosting.');
if(args[0]==='--check')process.exit(0);
const argv=['-y','firebase-tools@15.34.0','deploy','--project',project,'--account',account,
 '--config','firebase.commerce.cloud-hml.json','--only',target,'--non-interactive'];
const r=process.platform==='win32'
 ?spawnSync('cmd.exe',['/d','/s','/c','npx.cmd '+argv.join(' ')],{cwd:root,stdio:'inherit'})
 :spawnSync('npx',argv,{cwd:root,stdio:'inherit'});
if(r.error)throw r.error;
if(r.status!==0)throw Error('Deploy da callable HML falhou. Não tentar migrar dados.');
console.log('Callable fictícia enviada ao projeto HML. Firestore operacional continua bloqueado até aprovação específica das regras.');
