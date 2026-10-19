import {validarPinsHml,hashCredencialHml} from './commerceHmlOperationalCore.js';

const IDS=['admin','caixa-2'];

// A recuperação nunca depende do PIN antigo e só existe na HML.
// Exige reautenticação Google recente, não apenas uma sessão antiga aberta.
export function autenticacaoRecenteHml(auth,now=Date.now()){
 const t=Number(auth?.token?.auth_time);
 return Number.isFinite(t)&&t>0&&Number.isFinite(now)&&
  now>=t*1000&&now-t*1000<=5*60*1000;
}

export function prepararRedefinicaoPinsHml({loja,uid,operacao,acessos,pinAdmin,pinSegundo}){
 validarPinsHml(pinAdmin,pinSegundo);
 if(!loja||loja.tipo!=='homologacao_operacional'||loja.testeSomente!==true||
    loja.homologacaoProprietarioUid!==uid)
  throw new Error('Loja de teste não confirmada. Redefinição bloqueada.');
 if(!operacao||!Array.isArray(operacao.vendedores)||operacao.vendedores.length!==2||
    operacao.vendedores.some(o=>!IDS.includes(o?.id))||
    new Set(operacao.vendedores.map(o=>o.id)).size!==2)
  throw new Error('Operadores da loja fictícia divergentes. Redefinição bloqueada.');
 if(!Array.isArray(acessos)||acessos.length!==2||
    acessos.some((o,i)=>o?.ativo!==true||o?.papel!=='admin'||
      !Number.isSafeInteger(o?.versao)||o.versao<1||
      o.pinVersion!==2||typeof o.pinHash!=='string'||!o.pinSalt))
  throw new Error('Registros de acesso privados divergentes. Redefinição bloqueada.');
 const cred=[hashCredencialHml(pinAdmin),hashCredencialHml(pinSegundo)];
 const vendedores=operacao.vendedores.map(op=>{
  const idx=IDS.indexOf(op.id);
  return {...op,...cred[idx],pinTrocaObrigatoria:false,senha:null};
 });
 const privado=acessos.map((a,i)=>({
  ...cred[i],versao:a.versao+1,
 }));
 return {vendedores,privado};
}
