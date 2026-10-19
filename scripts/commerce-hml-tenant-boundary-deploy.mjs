/** Atualização atômica de alvo: apenas as três callables administrativas HML.
 * --check: somente arquivos locais; --deploy-admin: somente funções selecionadas.
 * Produção ZenOS, regras, Auth, Storage, live Hosting e lojas são fora de escopo.
 */
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const project='zenos-commerce-homologacao',account='itamarbenit@gmail.com';
const modes=['--check','--deploy-admin'];
const [mode,...rest]=process.argv.slice(2);
if(!modes.includes(mode)||rest.length)throw Error('Use --check ou --deploy-admin, somente na homologação.');
for(const key of ['GCLOUD_PROJECT','GCP_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])
 if(process.env[key]&&process.env[key]!==project)
  throw Error('Projeto externo à homologação detectado; publicação bloqueada.');
const read=path=>readFileSync(resolve(root,path),'utf8');
const config=JSON.parse(read('firebase.commerce.cloud-hml.json'));
if(config.functions?.codebase!=='fiscal'||config.functions.source!=='functions'||
   config.firestore?.rules!=='firestore.commerce.cloud-hml.rules'||
   config.hosting?.public!=='dist-commerce-hml')throw Error('Configuração HML diverge.');
const files={
 auth:read('functions/src/commerceAuthorization.js'),
 studio:read('functions/src/commerceStudio.js'),
 orders:read('functions/src/commerceOrders.js'),
 media:read('functions/src/commerceMedia.js'),
 client:read('src/components/ZenCommercePortal.jsx'),
 notice:read('src/components/ZenCommerceOrderNotice.jsx')
};
for(const fragment of [
 'authorizedOperationalHml(process.env,auth)',
 "loja?.tipo!=='homologacao_operacional'",
 'loja?.homologacaoProprietarioUid!==auth.uid',
 'typeof sessaoZenOS',
 'return sessao;'
])if(!files.auth.includes(fragment))throw Error('Autorização de loja não confirmada: '+fragment);
if(!files.studio.includes('contratoHml:CONTRATO_HML_ISOLAMENTO')||
   !files.orders.includes('const responder=dados=>executandoHmlCommerce()')||
   !files.media.includes('autorizarOperadorCommerce(request.auth,db,request.data?.sessaoZenOS)')||
   !files.client.includes('conferirRespostaHml(d,userId)')||
   !files.notice.includes('conferirRespostaHml(r,userId)'))
 throw Error('Contrato HML não está presente em todos os serviços.');
const envPath=resolve(root,'functions/.env.'+project);
if(mode==='--deploy-admin'){
 if(!existsSync(envPath))throw Error('Configuração HML já existente não encontrada; sem deploy.');
 const expected={ZENOS_COMMERCE_MEDIA_ENABLED:'true',ZENOS_COMMERCE_HOMOLOGACAO:'true',
  ZENOS_COMMERCE_STORAGE_BUCKET:'zenos-commerce-homologacao.firebasestorage.app'};
 const rows=read('functions/.env.'+project).split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
 const m=new Map(rows.map(x=>{const i=x.indexOf('=');if(i<1)throw Error('Configuração inválida.');return [x.slice(0,i).trim(),x.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
 if(rows.length!==3||m.size!==3||Object.entries(expected).some(([k,v])=>m.get(k)!==v))
  throw Error('Flags de homologação divergentes. Nenhuma Function será publicada.');
}
console.log('PASSOU: somente Commerce HML, loja/conta por UID e contrato estrito; nenhum deploy de dados/regras/Hosting.');
if(mode==='--check')process.exit(0);
const target='functions:fiscal:commerceStudio,functions:fiscal:commercePedidosAdmin,functions:fiscal:commerceMidia';
const argv=['--yes','firebase-tools@15.34.0','deploy','--project',project,'--account',account,
 '--config','firebase.commerce.cloud-hml.json','--only',target,'--non-interactive'];
console.log('Atualizando SOMENTE as três funções administrativas no Firebase HML; se CLI mencionar exclusões, abortar.');
const r=spawnSync('npx',argv,{cwd:root,stdio:'inherit',timeout:300000});
if(r.error)throw r.error;
if(r.status!==0)throw Error('Deploy seletivo falhou. Não insistir; conferir logs/serviços, sem alterar dados.');
console.log('PASSOU: deploy seletivo finalizado; confirmar versão e identidade pela prévia antes de operar.');
