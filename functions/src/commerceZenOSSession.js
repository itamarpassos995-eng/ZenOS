import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {randomBytes,createHash,pbkdf2Sync,timingSafeEqual} from 'node:crypto';
import {obterAdminFirestore} from './firebaseAdmin.js';
import {ambienteMidiaCommercePronto} from './commerceStorageSafetyCore.js';
const idValido=v=>typeof v==='string'&&/^[a-zA-Z0-9._:-]{1,120}$/.test(v)&&!['.','..','__proto__'].includes(v);
export const hashSessaoCommerce=value=>createHash('sha256').update(value).digest('hex');
export const acessoZenOSRef=(db,loja,id)=>db.doc(`lojas/${loja}/commerce_private/operador-${hashSessaoCommerce(id)}`);
export function validarIdentidadeZenOS(auth){
 if(!idValido(auth?.uid)||!['password','google.com'].includes(auth?.token?.firebase?.sign_in_provider))throw new HttpsError('unauthenticated','Entre normalmente no ZenOS para acessar a loja online.');
}
export function validarAcessoZenOS(acesso){
 if(acesso?.ativo!==true||acesso?.papel!=='admin'||!Number.isSafeInteger(acesso?.versao)||acesso.versao<1)
  throw new HttpsError('permission-denied','Operador sem permissão para administrar a loja online.');
}
export function conferirPinZenOS(acesso,pin){
 if(typeof pin!=='string'||pin.length<4||pin.length>128||acesso.pinVersion!==2||!/^[a-f0-9]{32}$/.test(acesso.pinSalt||'')||!/^[a-f0-9]{64}$/.test(acesso.pinHash||''))return false;
 const hash=pbkdf2Sync(pin,Buffer.from(acesso.pinSalt,'hex'),120000,32,'sha256');
 return timingSafeEqual(hash,Buffer.from(acesso.pinHash,'hex'));
}
// Credenciais privadas são provisionadas pelo backend na ativação do módulo.
// NUNCA copiar automaticamente permissões/PIN de documentos editáveis pelo cliente.
export const commerceSessaoZenOS=onCall({region:'southamerica-east1',timeoutSeconds:30,memory:'256MiB',maxInstances:2},async request=>{
 if(!ambienteMidiaCommercePronto(process.env))throw new HttpsError('failed-precondition','Integração ainda não ativada neste ambiente.');
 validarIdentidadeZenOS(request.auth);
 if(!idValido(request.data?.operadorId)||request.data?.lojaId!==undefined)throw new HttpsError('invalid-argument','Operador inválido.');
 const db=await obterAdminFirestore(),lojaId=request.auth.uid,operadorId=request.data.operadorId;
 const acessoRef=acessoZenOSRef(db,lojaId,operadorId);
 const limiteRef=db.doc(`lojas/${lojaId}/commerce_private/acesso-${hashSessaoCommerce(operadorId)}`);
 const agora=Date.now(),segredo=randomBytes(32).toString('hex');
 const resultado=await db.runTransaction(async tx=>{
  const [a,l]=await Promise.all([tx.get(acessoRef),tx.get(limiteRef)]),acesso=a.data();validarAcessoZenOS(acesso);
  const contador=l.data()||{},janela=Number(contador.inicio||0),tentativas=agora-janela<900000?Number(contador.tentativas||0):0;
  if(tentativas>=5)throw new HttpsError('resource-exhausted','Limite de tentativas. Aguarde 15 minutos antes de entrar novamente.');
  if(!conferirPinZenOS(acesso,request.data.pin)){
   tx.set(limiteRef,{inicio:tentativas?janela:agora,tentativas:tentativas+1});return {negado:true};
  }
  const expiraEm=agora+8*3600000;
  tx.set(limiteRef,{inicio:agora,tentativas:0});
  tx.create(db.doc(`lojas/${lojaId}/commerce_private/sessao-${hashSessaoCommerce(segredo)}`),{operadorId,versao:acesso.versao,expiraEm,expiresAt:new Date(expiraEm)});
  return {lojaId,operadorId,expiraEm};
 });
 if(resultado.negado)throw new HttpsError('permission-denied','PIN do operador não autorizado para a loja online.');
 return {...resultado,sessaoZenOS:segredo};
});
export async function autorizarSessaoZenOS(auth,db,segredo){
 validarIdentidadeZenOS(auth);
 if(!/^[a-f0-9]{64}$/.test(segredo||''))throw new HttpsError('permission-denied','Sessão da loja online indisponível. Entre novamente no ZenOS.');
 const sessao=await db.doc(`lojas/${auth.uid}/commerce_private/sessao-${hashSessaoCommerce(segredo)}`).get();
 const s=sessao.data();
 if(!s||!idValido(s.operadorId)||!Number.isFinite(s.expiraEm)||s.expiraEm<=Date.now())throw new HttpsError('permission-denied','Sessão da loja online expirada. Entre novamente no ZenOS.');
 const a=await acessoZenOSRef(db,auth.uid,s.operadorId).get();validarAcessoZenOS(a.data());
 if(a.data().versao!==s.versao)throw new HttpsError('permission-denied','Permissão atualizada. Entre novamente no ZenOS.');
 return {lojaId:auth.uid,operadorUid:s.operadorId};
}
