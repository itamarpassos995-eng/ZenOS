import {prepararCadastroFocus} from './fiscalAtivacaoCore.js';

// The master token is never received from a customer or stored in Firestore.
export async function obterTokenFocus({fetchImpl=fetch}={}) {
  if(process.env.FUNCTIONS_EMULATOR==='true')return null;
  const {applicationDefault}=await import('firebase-admin/app');
  const {access_token}=await applicationDefault().getAccessToken();
  const project=process.env.GCLOUD_PROJECT||process.env.GCP_PROJECT;
  const response=await fetchImpl(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets/ZENOS_FOCUS_API_TOKEN/versions/latest:access`,{
    headers:{Authorization:`Bearer ${access_token}`},signal:AbortSignal.timeout(10000),redirect:'error',
  });
  if([403,404].includes(response.status))return null;
  if(!response.ok)throw new Error('FISCAL_CREDENCIAL_TEMPORARIAMENTE_INDISPONIVEL');
  const data=await response.json();
  if(typeof data.payload?.data!=='string')throw new Error('FISCAL_CREDENCIAL_TEMPORARIAMENTE_INDISPONIVEL');
  return Buffer.from(data.payload.data,'base64').toString('utf8').trim()||null;
}

export async function validarEmpresaFocus({cadastro,token,fetchImpl=fetch}={}) {
  if(typeof token!=='string'||token.length<10)return {cadastroValidado:false,codigo:'FOCUS_CONTA_PENDENTE'};
  let response;
  try {
    response=await fetchImpl('https://api.focusnfe.com.br/v2/empresas?dry_run=1',{
      method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${token}:`).toString('base64')}`,'Content-Type':'application/json'},
      body:JSON.stringify(prepararCadastroFocus(cadastro)),signal:AbortSignal.timeout(15000),redirect:'error',
    });
  } catch{return {cadastroValidado:false,codigo:'FOCUS_INDISPONIVEL'};}
  // Provider response may contain tokens. Never return, log or persist it.
  if(!response.ok)return {cadastroValidado:false,codigo:[401,403].includes(response.status)?'FOCUS_CREDENCIAL_RECUSADA':response.status>=500||response.status===429?'FOCUS_INDISPONIVEL':'FOCUS_DADOS_RECUSADOS'};
  try {
    const data=await response.json();
    if(typeof data?.cnpj!=='string'||data.cnpj.replace(/\D/g,'')!==cadastro.cnpj)return {cadastroValidado:false,codigo:'FOCUS_RESPOSTA_INVALIDA'};
  } catch{return {cadastroValidado:false,codigo:'FOCUS_RESPOSTA_INVALIDA'};}
  return {cadastroValidado:true,codigo:'FOCUS_CADASTRO_VALIDADO'};
}
