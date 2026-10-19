/**
 * Entrega isolada de cadastro opcional/checkout sem estado persistido.
 * --check: somente leitura e validações locais (CI).
 * --verify-remote: prova a compatibilidade do backend HML com a consulta do pedido (sem autenticação ou escrita).
 * --deploy-commerce: SOMENTE Functions públicas + administrativas no Firebase HML.
 * Não publica main, Hosting live, Firestore, Auth, Storage ou outros serviços.
 */
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const project='zenos-commerce-homologacao',account='itamarbenit@gmail.com';
const [action,...rest]=process.argv.slice(2);
if(!['--check','--deploy-commerce','--verify-remote'].includes(action)||rest.length)throw Error('Use --check, --deploy-commerce ou --verify-remote.');
for(const variable of ['GCLOUD_PROJECT','GCP_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])
 if(process.env[variable]&&process.env[variable]!==project)
  throw Error('Projeto atual nao e a homologacao. Operacao recusada.');
const read=path=>readFileSync(resolve(root,path),'utf8');
const config=JSON.parse(read('firebase.commerce.cloud-hml.json'));
if(config.functions?.source!=='functions'||config.functions?.codebase!=='fiscal'||
   config.firestore?.rules!=='firestore.commerce.cloud-hml.rules'||
   config.hosting?.public!=='dist-commerce-hml')
 throw Error('Configuracao de funcoes isoladas mudou; nenhuma publicacao.');
const source=read('functions/src/commerceOrders.js'),core=read('functions/src/commerceOrdersCore.js'),
 storefront=read('src/components/ZenCommerceStorefront.jsx'),admin=read('src/components/ZenCommercePortal.jsx'),
 auth=read('src/core/commercePublicApi.js');
for(const [nome,codigo,fragmentos] of [
 ['servidor',source,['autorizarOperadorCommerce(request.auth,db,request.data?.sessaoZenOS)',
  'if(action===\'listarClientesOnline\')',"['catalogo','criarPedido','consultarPedido'].includes(action)",'lojas/${lojaId}/commerce_clientes/',
  'tx.create(ref,data)','cadastroSolicitado','marketingAutorizado:false',
  'CONTRATO_HML_ISOLAMENTO']],
 ['validacao',core,['aceitePromocoes&&!criarCadastro','criarCadastro:input.criarCadastro===true']],
 ['vitrine',storefront,['setCarrinho({});setCliente(novoCliente());setRecibo(r);',
  'sessionStorage.removeItem(chaveSessao(idPublico))','criarCadastro','aceitePromocoes']],
 ['painel',admin,['listarClientesOnline','conferirRespostaHml(data,userId)']],
 ['credencial',auth,['inMemoryPersistence','signOut(auth)']]
])for(const fragment of fragmentos)
 if(!codigo.includes(fragment))throw Error('Contrato de '+nome+' incompleto: '+fragment);
if(action==='--verify-remote'){
 // O endpoint em HML deve reconhecer consultarPedido ANTES de autenticar.
 // Sem UID, chave de usuário ou dados reais: a resposta esperada é UNAUTHENTICATED.
 // Backend antigo retornava INVALID_ARGUMENT (Ação inválida) e prendia a interface.
 const endpoint='https://southamerica-east1-'+project+'.cloudfunctions.net/commerceLoja';
 let response;
 try{response=await fetch(endpoint,{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({data:{action:'consultarPedido',idPublico:'zc-abcdefghjkmnpq',chaveEnvio:'probe-exclusiva-sem-auth'}}),
  signal:AbortSignal.timeout(15000)
 });}catch(e){throw Error('Não foi possível consultar a Function HML: '+String(e?.message||e));}
 let result;try{result=await response.json();}catch{throw Error('Resposta do checkout HML não é JSON. Deploy bloqueado.');}
 const status=String(result?.error?.status||'');
 if(status!=='UNAUTHENTICATED'||response.status!==401)
  throw Error('A Function HML não comprovou contrato de consulta: HTTP '+response.status+', status '+(status||'ausente')+'. Não publicar frontend.');
 console.log('PASSOU: commerceLoja da HML reconhece consultarPedido (HTTP 401 esperado sem autenticação).');
 process.exit(0);
}
if(action==='--deploy-commerce'){
 const path=resolve(root,'functions/.env.'+project);
 if(!existsSync(path))throw Error('Arquivo de configuracao da HML ausente. Publicacao recusada.');
 const env=read('functions/.env.'+project).split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
 const expected=new Map([
  ['ZENOS_COMMERCE_MEDIA_ENABLED','true'],
  ['ZENOS_COMMERCE_HOMOLOGACAO','true'],
  ['ZENOS_COMMERCE_STORAGE_BUCKET','zenos-commerce-homologacao.firebasestorage.app']
 ]);
 const vars=new Map(env.map(line=>{
  const idx=line.indexOf('=');if(idx<=0)throw Error('Arquivo .env malformado.');
  return [line.slice(0,idx),line.slice(idx+1).replace(/^['"]|['"]$/g,'')];
 }));
 if(vars.size!==expected.size||env.length!==expected.size||
    [...expected].some(([key,value])=>vars.get(key)!==value))
  throw Error('Variaveis fora da homologacao, abortando.');
}
console.log('PASSOU: somente cadastro online HML/checkout; sem alteracoes de V1/V2/PDV/estoque/caixa.');
if(action==='--check')process.exit(0);
const targets='functions:fiscal:commerceLoja,functions:fiscal:commercePedidosAdmin';
const result=spawnSync('npx',['--yes','firebase-tools@15.34.0','deploy','--project',project,
 '--account',account,'--config','firebase.commerce.cloud-hml.json','--only',targets,'--non-interactive'],
 {cwd:root,stdio:'inherit',timeout:300000});
if(result.error)throw result.error;
if(result.status!==0)throw Error('Deploy de duas funcoes falhou; nao continuar com Hosting.');
console.log('PASSOU: duas funcoes Commerce publicadas na HML. Confirme a lista remota antes da previa.');
