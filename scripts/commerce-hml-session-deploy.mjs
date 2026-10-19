/**
 * Fluxo cirúrgico: instalar SOMENTE a callable commerceSessaoZenOS,
 * necessária para o Studio salvar rascunho pela sessão do terminal.
 * --check nunca faz rede ou altera dados.
 * --deploy-session seleciona apenas esta Function no projeto HML.
 */
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const project='zenos-commerce-homologacao',account='itamarbenit@gmail.com';
const args=process.argv.slice(2);
if(args.length!==1||!['--check','--deploy-session'].includes(args[0]))
 throw Error('Use --check ou --deploy-session; projeto HML apenas.');
for(const name of ['GCLOUD_PROJECT','GCP_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])
 if(process.env[name]&&process.env[name]!==project)
  throw Error('Projeto ativo diferente do destino HML. Publicação bloqueada.');
const text=name=>readFileSync(resolve(root,name),'utf8');
const config=JSON.parse(text('firebase.commerce.cloud-hml.json'));
if(config.functions?.source!=='functions'||config.functions?.codebase!=='fiscal'||
   config.firestore?.rules!=='firestore.commerce.cloud-hml.rules'||
   config.hosting?.public!=='dist-commerce-hml')
 throw Error('Configuração cloud do Commerce diverge do escopo HML.');
const name='commerceSessaoZenOS',target='functions:fiscal:'+name;
const idx=text('functions/src/index.js'),session=text('functions/src/commerceZenOSSession.js');
if(!idx.includes("export {commerceSessaoZenOS} from './commerceZenOSSession.js';")||
 !session.includes('validarIdentidadeZenOS(request.auth)')||
 !session.includes('acessoZenOSRef(db,lojaId,operadorId)')||
 !session.includes('validarAcessoZenOS(acesso)')||
 !session.includes('conferirPinZenOS(acesso,request.data.pin)')||
 !session.includes('tx.create(db.doc(')||
 !session.includes('timingSafeEqual(hash,Buffer.from(acesso.pinHash'))||
 !session.includes("getFunctions") && false)
 throw Error('Validações canônicas da callable de sessão não confirmadas.');
const envPath=resolve(root,'functions/.env.'+project);
if(!existsSync(envPath))throw Error('Arquivo de homologação existente não encontrado; não gerar ou substituir.');
const required={
 ZENOS_COMMERCE_MEDIA_ENABLED:'true',
 ZENOS_COMMERCE_HOMOLOGACAO:'true',
 ZENOS_COMMERCE_STORAGE_BUCKET:'zenos-commerce-homologacao.firebasestorage.app'
};
const rows=text('functions/.env.'+project).split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
const values=new Map(rows.map(line=>{
 const i=line.indexOf('=');
 if(i<1)throw Error('Variável HML inválida.');
 return [line.slice(0,i).trim(),line.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];
}));
if(rows.length!==values.size||rows.length!==Object.keys(required).length||
 Object.entries(required).some(([k,v])=>values.get(k)!==v))
 throw Error('Flags HML inseguras ou divergentes. Nenhuma Function será publicada.');
console.log('PASSOU: alvo único '+target+', Firebase '+project+', autorização privada por PIN, sem Firestore rules/Hosting/Storage.');
if(args[0]==='--check')process.exit(0);
const argv=['--yes','firebase-tools@15.34.0','deploy','--project',project,'--account',account,
 '--config','firebase.commerce.cloud-hml.json','--only',target,'--non-interactive'];
const proc=spawnSync('npx',argv,{cwd:root,stdio:'inherit',timeout:240000});
if(proc.error)throw proc.error;
if(proc.status!==0)throw Error('Deploy da callable de sessão falhou; não insistir nem migrar dados.');
console.log('Function Commerce de sessão publicada em homologação; valide a lista remota antes de testar o editor.');
