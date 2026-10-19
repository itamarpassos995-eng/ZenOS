/** Obtém apenas configuração pública do SDK pelo Firebase CLI já autenticado. */
import {spawnSync} from 'node:child_process';
import {writeFileSync,existsSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length!==2)throw Error('Este comando não aceita troca de projeto ou conta.');
const args=['-y','firebase-tools@15.34.0','apps:sdkconfig','WEB','--project','zenos-commerce-homologacao','--account','itamarbenit@gmail.com','--json'];
const r=process.platform==='win32'?spawnSync('cmd.exe',['/d','/s','/c','npx.cmd '+args.join(' ')],{cwd:root,encoding:'utf8'}):spawnSync('npx',args,{cwd:root,encoding:'utf8'});
if(r.status!==0){console.error('Não foi possível obter a configuração pública. Implante Auth no projeto de homologação primeiro.');console.error(r.stderr||r.stdout||r.error?.message);process.exit(1);}
let result;try{result=JSON.parse(r.stdout).result.sdkConfig;}catch{throw Error('Resposta inesperada do CLI; nenhum arquivo foi gravado.');}
if(result?.projectId!=='zenos-commerce-homologacao'||result?.storageBucket!=='zenos-commerce-homologacao.firebasestorage.app'||result?.authDomain!=='zenos-commerce-homologacao.firebaseapp.com'||!result?.appId||!result?.apiKey)throw Error('SDK não corresponde ao projeto isolado.');
const cfg={apiKey:result.apiKey,authDomain:result.authDomain,projectId:result.projectId,storageBucket:result.storageBucket,appId:result.appId,messagingSenderId:result.messagingSenderId};
const path=resolve(root,'.env.commerce-hml.local'),content="VITE_ZENOS_COMMERCE_HML_FIREBASE_CONFIG='"+JSON.stringify(cfg)+"'\n";
if(existsSync(path)&&readFileSync(path,'utf8')!==content)throw Error('Configuração local divergente; não foi sobrescrita.');
if(!existsSync(path))writeFileSync(path,content,{flag:'wx'});
console.log('Configuração pública da homologação preparada. Execute: npm.cmd run dev -- --mode commerce-hml');
console.log('Abra a URL local exibida pelo Vite, no caminho /commerce-homologacao.');
