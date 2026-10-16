/** Deploy restrito às duas funções Commerce do projeto separado. Nunca usa firebase.json. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {protegerAmbienteMidiaCommerce} from '../functions/src/commerceStorageSafetyCore.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const project='zenos-commerce-homologacao';
const bucket='zenos-commerce-homologacao.firebasestorage.app';
if(process.env.GCLOUD_PROJECT&&process.env.GCLOUD_PROJECT!==project)throw Error('Projeto diferente da homologação: implantação bloqueada.');
if(process.argv.slice(2).some(arg=>!['--check'].includes(arg)))throw Error('Argumentos não permitidos. O destino de homologação é fixo.');
protegerAmbienteMidiaCommerce({mediaEnabled:'true',homologacao:'true',projectId:project,bucket});
const config=JSON.parse(readFileSync(resolve(root,'firebase.commerce.cloud-hml.json'),'utf8'));
if(config.firestore||config.storage||config.hosting||config.functions?.source!=='functions'||config.functions?.codebase!=='fiscal')
 throw Error('Configuração de implantação inesperada. Nenhuma regra ou site será implantado por este script.');
const envPath=resolve(root,'functions/.env.'+project);
const vars={ZENOS_COMMERCE_MEDIA_ENABLED:'true',ZENOS_COMMERCE_HOMOLOGACAO:'true',ZENOS_COMMERCE_STORAGE_BUCKET:bucket};
if(existsSync(envPath)){
 const configured=Object.fromEntries(readFileSync(envPath,'utf8').split(/\r?\n/).filter(line=>line.trim()&&!line.startsWith('#')).map(line=>{const i=line.indexOf('=');return [line.slice(0,i).trim(),line.slice(i+1).trim()];}));
 if(Object.keys(configured).length!==3||Object.entries(vars).some(([key,val])=>configured[key]!==val))
  throw Error('Arquivo de ambiente existente diverge do destino seguro. Revise sem sobrescrever.');
}
if(process.argv.includes('--check')){
 console.log('PASSOU: destino exclusivo '+project+'; somente commerceStudio/commerceMidia; sem regras, site ou funções fiscais.');
 process.exit(0);
}
if(!existsSync(envPath))writeFileSync(envPath,Object.entries(vars).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{flag:'wx',mode:0o600});
console.log('Implantando somente as duas funções Commerce em '+project+'.');
const args=['-y','firebase-tools@15.34.0','deploy','--project',project,'--account','itamarbenit@gmail.com','--config','firebase.commerce.cloud-hml.json','--only','functions:fiscal:commerceStudio,functions:fiscal:commerceMidia'];
// cmd.exe precisa resolver npx.cmd; todos os argumentos são constantes, sem entrada do usuário.
const result=process.platform==='win32'
 ?spawnSync('cmd.exe',['/d','/s','/c','npx.cmd '+args.join(' ')],{cwd:root,stdio:'inherit'})
 :spawnSync('npx',args,{cwd:root,stdio:'inherit'});
if(result.error){console.error(result.error.message);process.exit(1);}
process.exit(result.status??1);
