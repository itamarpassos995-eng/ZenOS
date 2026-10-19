/**
 * Auditoria SOMENTE LEITURA das regras remotas do Firestore Commerce HML.
 *
 * --check: valida precondições locais, sem rede/autenticação.
 * --audit: obtém release e ruleset autenticados, preserva cópia imutável
 *         local (0600), compara com baseline deny-all e recusa divergência.
 *
 * NÃO executa deploy, patch, delete ou substituição de regras.
 */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const project='zenos-commerce-homologacao';
const owner='itamarbenit@gmail.com';
const releaseName='projects/'+project+'/releases/cloud.firestore';
const rulesetPrefix='projects/'+project+'/rulesets/';
const args=process.argv.slice(2);
if(args.length!==1||!['--check','--audit'].includes(args[0]))
 throw Error('Use --check ou --audit. Nada será publicado.');
for(const v of ['GCLOUD_PROJECT','GCP_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID']){
 if(process.env[v] && process.env[v]!==project)throw Error('Ambiente inesperado: '+v);
}
const local=readFileSync(resolve(root,'firestore.commerce.cloud-hml.rules'),'utf8');
if(!/allow\s+read,\s*write\s*:\s*if\s+false;/.test(local))
 throw Error('Baseline cloud deny-all local inválida. Nenhuma auditoria aprovada.');
if(args[0]==='--check'){
 console.log('PASSOU: auditoria remota read-only restrita a '+project+'; baseline local deny-all; sem conexão remota.');
 process.exit(0);
}
const auth=spawnSync('gcloud',['auth','print-access-token','--account',owner],{
 encoding:'utf8',timeout:20000,env:{...process.env,CLOUDSDK_CORE_DISABLE_PROMPTS:'1'}
});
if(auth.error||auth.status!==0||!auth.stdout?.trim())
 throw Error('Conta de homologação não autenticada no gcloud. Nenhum deploy realizado.');
const token=auth.stdout.trim();
if(!/^[\w.-]+$/.test(token))throw Error('Token de acesso com formato inesperado.');
const get=async name=>{
 const resp=await fetch('https://firebaserules.googleapis.com/v1/'+name,{
  headers:{Authorization:'Bearer '+token,Accept:'application/json'},
  method:'GET',signal:AbortSignal.timeout(15000),redirect:'error'
 });
 if(!resp.ok)throw Error('Leitura remota recusada ('+resp.status+'); nenhum deploy realizado.');
 return resp.json();
};
const release=await get(releaseName);
if(release.name!==releaseName||!release.rulesetName?.startsWith(rulesetPrefix)||
 !/^[a-zA-Z0-9-]+$/.test(release.rulesetName.slice(rulesetPrefix.length)))
 throw Error('Release Firestore HML aponta para recurso inesperado. Bloqueado.');
const ruleset=await get(release.rulesetName);
const files=ruleset?.source?.files;
if(ruleset?.name!==release.rulesetName||!Array.isArray(files)||files.length===0||
 files.some(f=>typeof f.content!=='string'||!f.content.trim()))
 throw Error('Ruleset remoto inconsistente; nenhuma publicação.');
const digest=createHash('sha256').update(JSON.stringify({release,ruleset})).digest('hex');
const base=join(homedir(),'.zenos-commerce-hml-rules-backups');
mkdirSync(base,{recursive:true,mode:0o700});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const path=join(base,stamp+'-'+digest.slice(0,12)+'.json');
writeFileSync(path,JSON.stringify({
 project,recuperadoEm:new Date().toISOString(),sha256:digest,
 release,ruleset
},null,2)+'\n',{flag:'wx',mode:0o600});
const normalize=s=>s.replace(/\/\/[^\n]*/g,'').replace(/\s+/g,'');
const match=files.length===1&&normalize(files[0].content)===normalize(local);
console.log('Regras remotas HML preservadas em backup local protegido. Release: '+release.rulesetName);
console.log('SHA256 do backup: '+digest+'; baseline deny-all: '+(match?'IGUAL':'DIVERGENTE'));
if(!match)throw Error('Ruleset remoto é diferente do baseline esperado. Implantação BLOQUEADA; confira a cópia segura.');
console.log('PASSOU: leitura remota, backup preservado, baseline HML confirmado. Nenhuma alteração publicada.');
