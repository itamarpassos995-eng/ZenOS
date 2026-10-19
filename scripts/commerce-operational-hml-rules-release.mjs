/**
 * HML operational Firestore rules release (do not use on ZenOS production).
 * --check: offline guards, no cloud calls or writes
 * --verify: GET remote current rules, no writes
 * --publish: mandatory remote baseline backup/check, rules-only deployment,
 *            then verify published rules.
 */
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const project='zenos-commerce-homologacao';
const account='itamarbenit@gmail.com';
const cfg='firebase.commerce.operational-rules-release.json';
const target='firestore:rules';
const args=process.argv.slice(2);
if(args.length!==1||!['--check','--verify','--publish'].includes(args[0]))
 throw Error('Use --check, --verify ou --publish. Destino fixo: homologação exclusivamente.');
const action=args[0];
for(const key of ['GCLOUD_PROJECT','GCP_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])
 if(process.env[key] && process.env[key]!==project)
  throw Error('Destino diferente do Firebase homologação em '+key+'. Abortado.');
const file=name=>readFileSync(resolve(root,name),'utf8');
const config=JSON.parse(file(cfg));
if(JSON.stringify(Object.keys(config).sort())!==JSON.stringify(['firestore'])||
   JSON.stringify(Object.keys(config.firestore).sort())!==JSON.stringify(['database','rules'])||
   config.firestore.rules!=='firestore.commerce.operational-hml.rules'||
   config.firestore.database!=='(default)')
 throw Error('Configuração não é exclusiva de Firestore rules do banco default.');
const currentBaseline=file('firestore.commerce.cloud-hml.rules');
if(!/allow read, write: if false;/.test(currentBaseline))
 throw Error('Baseline original do projeto HML inválida.');
const rules=file('firestore.commerce.operational-hml.rules');
for(const fragment of [
 "request.auth.uid == lojaId",
 "request.auth.token.email == 'itamarbenit@gmail.com'",
 "request.auth.token.email_verified == true",
 "request.auth.token.firebase.sign_in_provider == 'google.com'",
 "homologacao_operacional",
 "homologacaoProprietarioUid == lojaId",
 "get(raiz).data.testeSomente == true",
 "allow create, update, delete: if false;",
 "docId in ['operacao', 'configuracoes']",
 "allow update,delete: if false;",
 "match /{other=**} {allow read, write: if false;}"
])if(!rules.includes(fragment))throw Error('Regra de segurança obrigatória ausente: '+fragment);
if(/allow\s+(?:read|write|create|update|delete)(?:\s*,\s*\w+)*\s*:\s*if\s+true\s*;/i.test(rules))
 throw Error('Ruleset HML contém permissão incondicional.');
const cli=(...cliArgs)=>{
 const argv=['-y','firebase-tools@15.34.0',...cliArgs];
 const o=process.platform==='win32'
  ?spawnSync('npx.cmd',argv,{cwd:root,stdio:'inherit',shell:true,timeout:240000})
  :spawnSync('npx',argv,{cwd:root,stdio:'inherit',timeout:240000});
 if(o.error)throw o.error;
 if(o.status!==0)throw Error('Firebase CLI falhou; interrompido, sem fallback.');
};
console.log('PASSOU: configuração Firestore-only e regras restritas a conta/projeto/loja fictícios.');
if(action==='--check')process.exit(0);

const tokenResult=spawnSync('gcloud',['auth','print-access-token','--account',account],{
 encoding:'utf8',timeout:20000,env:{...process.env,CLOUDSDK_CORE_DISABLE_PROMPTS:'1'}
});
if(tokenResult.error||tokenResult.status!==0||!tokenResult.stdout.trim())
 throw Error('Conta gcloud de homologação indisponível; nenhuma publicação.');
const token=tokenResult.stdout.trim();
const query=async(name)=>{
 const response=await fetch('https://firebaserules.googleapis.com/v1/'+name,{
  method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},
  redirect:'error',signal:AbortSignal.timeout(20000)
 });
 if(!response.ok)throw Error('Consulta do ruleset remoto recusada: HTTP '+response.status);
 return response.json();
};
const releasePath='projects/'+project+'/releases/cloud.firestore';
const prefix='projects/'+project+'/rulesets/';
const remote=async()=>{
 const rel=await query(releasePath);
 if(rel.name!==releasePath||!rel.rulesetName?.startsWith(prefix))
  throw Error('Release remoto aponta para recurso inesperado.');
 const set=await query(rel.rulesetName);
 if(set.name!==rel.rulesetName||!Array.isArray(set.source?.files)||set.source.files.length!==1)
  throw Error('Ruleset remoto não corresponde a um único arquivo auditável.');
 return {name:rel.rulesetName,content:set.source.files[0].content};
};
const normalize=value=>String(value).replace(/\/\/[^\n]*/g,'').replace(/\s+/g,'');
if(action==='--verify'){
 const actual=await remote();
 console.log('Ruleset remoto: '+actual.name);
 if(normalize(actual.content)!==normalize(rules))
  throw Error('NÃO APROVADO: regras operacionais ainda não estão publicadas ou divergem.');
 console.log('PASSOU: regras operacionais HML confirmadas no Firebase remoto.');
 process.exit(0);
}
// Save remote immutable snapshot and refuse any divergence, BEFORE deploying.
const audit=spawnSync(process.execPath,
 ['scripts/commerce-operational-hml-remote-audit.mjs','--audit'],
 {cwd:root,stdio:'inherit',timeout:45000});
if(audit.error)throw audit.error;
if(audit.status!==0)throw Error('Backup remoto/baseline não confirmado. PUBLICAÇÃO BLOQUEADA.');
const before=await remote();
if(normalize(before.content)!==normalize(currentBaseline))
 throw Error('Ruleset remoto mudou após auditoria; publicação bloqueada.');
console.log('Pré-condição confirmada; publicando SOMENTE '+target+' em '+project+'.');
cli('deploy','--project',project,'--account',account,'--config',cfg,
 '--only',target,'--non-interactive');
const after=await remote();
if(normalize(after.content)!==normalize(rules))
 throw Error('Deploy terminou mas ruleset remoto não corresponde ao esperado. NÃO UTILIZE O PDV.');
console.log('PASSOU: ruleset operacional exclusivo do Firebase HML publicado e verificado. Nenhuma Function/Hosting/Storage foi implantada.');
