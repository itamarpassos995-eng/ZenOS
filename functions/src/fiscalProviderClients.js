// Conectores HTTP fiscais — uso EXCLUSIVO no backend. Sem exports no frontend.
// Nenhuma chamada de rede ocorre sem invocação explícita por backend autorizado.
import { createHash } from 'node:crypto';

export class FiscalConnectorError extends Error {
  constructor(code) { super(code); this.name='FiscalConnectorError'; this.code=code; }
}
const exigir=(ok,code)=>{ if(!ok) throw new FiscalConnectorError(code); };
const texto=(v)=>typeof v==='string'?v.trim():'';
const refValida=(v)=>/^[a-zA-Z0-9._:-]{1,180}$/.test(texto(v));
const urlFocus='https://homologacao.focusnfe.com.br/v2';
const urlSifende='https://api.sifende.com.py/api/v1/documento-electronico';
const rotasFocus=Object.freeze({nfe:'nfe',nfce:'nfce',nfse:'nfse'});
const sha=(v)=>createHash('sha256').update(v).digest('hex');
const uuidEstavel=(chave)=>{const h=sha(chave);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};

const executar=async({fetchImpl,url,method,headers,body,timeoutMs=15000})=>{
  exigir(typeof fetchImpl==='function','FISCAL_TRANSPORTE_INDISPONIVEL');
  exigir(Number.isInteger(timeoutMs)&&timeoutMs>=1000&&timeoutMs<=30000,'FISCAL_TIMEOUT_INVALIDO');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    let resposta;
    try {
      resposta=await fetchImpl(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,redirect:'error'});
    } catch {
      throw new FiscalConnectorError('FISCAL_REDE_INDISPONIVEL');
    }
    if(!resposta||typeof resposta.status!=='number'||typeof resposta.json!=='function')throw new FiscalConnectorError('FISCAL_RESPOSTA_INVALIDA');
    if(resposta.status===401||resposta.status===403)throw new FiscalConnectorError('FISCAL_CREDENCIAL_RECUSADA');
    if(resposta.status===429||resposta.status>=500)throw new FiscalConnectorError('FISCAL_PROVEDOR_INDISPONIVEL');
    if(resposta.status>=400)throw new FiscalConnectorError('FISCAL_PROVEDOR_REJEITOU');
    let dados;
    try { dados=await resposta.json(); } catch {throw new FiscalConnectorError('FISCAL_RESPOSTA_INVALIDA');}
    exigir(dados&&typeof dados==='object'&&!Array.isArray(dados),'FISCAL_RESPOSTA_INVALIDA');
    return dados;
  } finally {clearTimeout(timer);}
};
const confirmarHomologacao=(ambiente)=>exigir(ambiente==='homologacao','FISCAL_PRODUCAO_BLOQUEADA');
const confirmarChave=(apiKey)=>exigir(texto(apiKey).length>=10,'FISCAL_CREDENCIAL_AUSENTE');
const confirmarPayload=(payload)=>exigir(payload&&typeof payload==='object'&&!Array.isArray(payload),'FISCAL_PAYLOAD_INVALIDO');

// BR — Focus: retorno processando_autorizacao é pendente, nunca autorizado automaticamente.
// A validação legal do payload NFe/NFCe/NFSe cabe à camada de mapeamento fiscal homologada.
export function criarFocusFiscal({apiKey,ambiente='homologacao',fetchImpl=fetch,timeoutMs=15000}={}){
  confirmarHomologacao(ambiente);confirmarChave(apiKey);
  const token=Buffer.from(`${apiKey}:`).toString('base64');
  const headers=Object.freeze({'authorization':`Basic ${token}`,'accept':'application/json','content-type':'application/json'});
  const rota=(tipo)=>{exigir(Object.hasOwn(rotasFocus,tipo),'FISCAL_TIPO_INVALIDO');return rotasFocus[tipo];};
  const normalizar=(dados,referencia)=>{
    exigir(typeof dados.status==='string','FISCAL_STATUS_AUSENTE');
    const status=dados.status;
    // Resposta do provedor ainda exige reconciliação persistida e conferência de identidade da loja.
    return Object.freeze({provedor:'focus',referencia,status,autorizacaoInformada:status==='autorizado',requerConciliacao:true,chaveFiscal:texto(dados.chave_nfe)||null});
  };
  return Object.freeze({
    async emitir({tipoDocumento,referencia,payload}){
      confirmarPayload(payload);exigir(refValida(referencia),'FISCAL_REFERENCIA_INVALIDA');
      const tipo=rota(tipoDocumento);
      const url=`${urlFocus}/${tipo}?ref=${encodeURIComponent(referencia)}`;
      const dados=await executar({fetchImpl,url,method:'POST',headers,body:payload,timeoutMs});
      return normalizar(dados,referencia);
    },
    async consultar({tipoDocumento,referencia}){
      exigir(refValida(referencia),'FISCAL_REFERENCIA_INVALIDA');
      const dados=await executar({fetchImpl,url:`${urlFocus}/${rota(tipoDocumento)}/${encodeURIComponent(referencia)}`,method:'GET',headers,timeoutMs});
      return normalizar(dados,referencia);
    },
  });
}

// PY — API key individual por contribuinte; POST com Idempotency-Key UUID estável.
// PENDIENTE exige polling por CDC; CDC presente NÃO implica aprovação DNIT.
export function criarSifendeFiscal({apiKey,ambiente='homologacao',fetchImpl=fetch,timeoutMs=15000}={}){
  confirmarHomologacao(ambiente);confirmarChave(apiKey);
  const headers=Object.freeze({'authorization':`Bearer ${apiKey}`,'accept':'application/json','content-type':'application/json'});
  const normalizar=(dados)=>{
    const estado=texto(dados.estado||dados.status);
    exigir(estado.length>0,'FISCAL_STATUS_AUSENTE');
    return Object.freeze({provedor:'sifende',status:estado,cdc:texto(dados.cdc)||null,autorizacaoInformada:['APROBADO','APROBADA'].includes(estado.toUpperCase()),requerConciliacao:true});
  };
  return Object.freeze({
    async emitir({chaveOperacao,payload}){
      exigir(refValida(chaveOperacao),'FISCAL_REFERENCIA_INVALIDA');confirmarPayload(payload);
      exigir(payload.tipoDocumento==='FACTURA_ELECTRONICA','FISCAL_TIPO_INVALIDO');
      const dados=await executar({fetchImpl,url:urlSifende,method:'POST',headers:{...headers,'Idempotency-Key':uuidEstavel(chaveOperacao)},body:payload,timeoutMs});
      return normalizar(dados);
    },
    async consultar({cdc}){
      exigir(/^[0-9]{44}$/.test(texto(cdc)),'FISCAL_CDC_INVALIDO');
      const dados=await executar({fetchImpl,url:`${urlSifende}/status/${cdc}`,method:'GET',headers,timeoutMs});
      return normalizar(dados);
    },
  });
}
