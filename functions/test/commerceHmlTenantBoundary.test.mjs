import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {autorizarOperadorCommerce,executandoHmlCommerce,CONTRATO_HML_ISOLAMENTO} from '../src/commerceAuthorization.js';

const uid='owner-ficticio-A',operador='admin',segredo='a'.repeat(64);
const hash=v=>createHash('sha256').update(v).digest('hex');
const sessaoPath=`lojas/${uid}/commerce_private/sessao-${hash(segredo)}`;
const acessoPath=`lojas/${uid}/commerce_private/operador-${hash(operador)}`;
const auth={uid,token:{email_verified:true,email:'itamarbenit@gmail.com',firebase:{sign_in_provider:'google.com'}}};
function dbFalso({loja={tipo:'homologacao_operacional',testeSomente:true,homologacaoProprietarioUid:uid},sessaoUid=uid}={}){
 const reads=[];
 const db={doc(path){reads.push(path);return {async get(){
  if(path===sessaoPath&&sessaoUid===uid)return {exists:true,data:()=>({operadorId:operador,versao:1,expiraEm:Date.now()+600_000})};
  if(path===acessoPath)return {exists:true,data:()=>({ativo:true,papel:'admin',versao:1})};
  if(path===`lojas/${uid}`)return {exists:true,data:()=>loja};
  if(path===`commerce_operator_access/${uid}`)return {exists:true,data:()=>({ativo:true,papel:'admin',lojaId:'OUTRA_LOJA'})};
  return {exists:false,data:()=>undefined};
 }};}};
 return {db,reads};
}
const vars={GCLOUD_PROJECT:'zenos-commerce-homologacao',ZENOS_COMMERCE_MEDIA_ENABLED:'true',ZENOS_COMMERCE_HOMOLOGACAO:'true',ZENOS_COMMERCE_STORAGE_BUCKET:'zenos-commerce-homologacao.firebasestorage.app'};
async function hml(fn){
 const before=Object.fromEntries(Object.keys(vars).map(k=>[k,process.env[k]]));
 Object.assign(process.env,vars);
 try{return await fn();}
 finally{for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
test('HML só recebe a loja de mesmo UID, com sessão de operador e raiz verificada',()=>hml(async()=>{
 const {db,reads}=dbFalso();
 assert.equal(executandoHmlCommerce(),true);
 const res=await autorizarOperadorCommerce(auth,db,segredo);
 assert.deepEqual(res,{lojaId:uid,operadorUid:operador});
 assert.deepEqual(reads,[sessaoPath,acessoPath,`lojas/${uid}`]);
 assert.equal(typeof CONTRATO_HML_ISOLAMENTO,'string');
}));
test('HML não usa cadastro individual legado mesmo que ele aponte para OUTRA_LOJA',()=>hml(async()=>{
 const {db,reads}=dbFalso();
 await assert.rejects(autorizarOperadorCommerce(auth,db,undefined),/Commerce da loja fictícia/);
 assert.deepEqual(reads,[],'nenhuma leitura privada antes do bloqueio');
}));
test('HML não aceita sessão de outra loja nem raiz sem titularidade ou marcadores',()=>hml(async()=>{
 for(const loja of [
  {tipo:'homologacao_operacional',testeSomente:true,homologacaoProprietarioUid:'OUTRA_LOJA'},
  {tipo:'producao',testeSomente:true,homologacaoProprietarioUid:uid},
  {tipo:'homologacao_operacional',testeSomente:false,homologacaoProprietarioUid:uid}
 ]){
  const {db,reads}=dbFalso({loja});
  await assert.rejects(autorizarOperadorCommerce(auth,db,segredo),/Cadastro fictício não pertence/);
  assert.equal(reads.some(p=>p.includes('OUTRA_LOJA')),false);
 }
 const {db}=dbFalso({sessaoUid:'OUTRA_LOJA'});
 await assert.rejects(autorizarOperadorCommerce(auth,db,segredo),/Sessão da loja online/);
}));
test('HML exige Google verificado e projeto/bucket corretos',()=>hml(async()=>{
 const {db,reads}=dbFalso();
 await assert.rejects(autorizarOperadorCommerce({...auth,token:{...auth.token,email_verified:false}},db,segredo),/Acesso Commerce da loja fictícia/);
 assert.deepEqual(reads,[]);
 process.env.ZENOS_COMMERCE_STORAGE_BUCKET='zenos-ac6b2.firebasestorage.app';
 await assert.rejects(autorizarOperadorCommerce(auth,db,segredo),/Acesso Commerce da loja fictícia/);
 assert.deepEqual(reads,[]);
}));
