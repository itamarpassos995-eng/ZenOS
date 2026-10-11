// Conciliação de respostas fiscais em backend isolado.
// Nenhum retorno de API é considerado autorização oficial sem evidência verificada.
export class FiscalReconciliationError extends Error {
  constructor(code){super(code);this.name='FiscalReconciliationError';this.code=code;}
}
const exigir=(cond,code)=>{if(!cond)throw new FiscalReconciliationError(code);};
const estados=new Set(['reservada','envio_iniciado','resultado_incerto','consulta_pendente','autorizacao_informada','rejeitada','autorizada_verificada']);
const idValido=x=>typeof x==='string'&&/^[a-zA-Z0-9._:-]{1,180}$/.test(x);

export function proximoEstadoFiscal({estadoAtual,resultado,provaOficialVerificada=false}={}){
  exigir(estados.has(estadoAtual),'FISCAL_ESTADO_INVALIDO');
  exigir(resultado&&resultado.requerConciliacao===true,'FISCAL_RETORNO_INVALIDO');
  // A API informar "autorizado" não é prova suficiente para liberar o documento.
  if(provaOficialVerificada===true)throw new FiscalReconciliationError('FISCAL_VERIFICADOR_OFICIAL_AUSENTE');
  if(estadoAtual==='autorizada_verificada')return estadoAtual;
  if(resultado.autorizacaoInformada===true)return 'autorizacao_informada';
  const status=String(resultado.status||'').toLowerCase();
  if(['rejeitado','rechazado','rechazada'].includes(status))return 'rejeitada';
  return 'consulta_pendente';
}

export async function registrarConciliacaoFiscal({firestore,operationPath,eventoId,resultado,now}={}){
  exigir(firestore&&typeof firestore.doc==='function'&&typeof firestore.runTransaction==='function','FISCAL_DB_INDISPONIVEL');
  exigir(typeof operationPath==='string'&&/^lojas\/[a-zA-Z0-9._:-]{1,180}\/fiscal_operations\/[a-f0-9]{64}$/.test(operationPath),'FISCAL_CAMINHO_INVALIDO');
  exigir(idValido(eventoId),'FISCAL_EVENTO_INVALIDO');
  exigir(typeof now==='string'&&!Number.isNaN(Date.parse(now)),'FISCAL_DATA_INVALIDA');
  const ref=firestore.doc(operationPath);
  return firestore.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    exigir(snap.exists,'FISCAL_OPERACAO_NAO_ENCONTRADA');
    const atual=snap.data();
    const lojaCaminho=operationPath.split('/')[1];
    exigir(atual.lojaId===lojaCaminho,'FISCAL_LOJA_DIVERGENTE');
    const eventos=Array.isArray(atual.conciliacoes)?atual.conciliacoes:[];
    if(eventos.some(e=>e.id===eventoId))return {alterada:false,estado:atual.estado};
    exigir(!['autorizada_verificada','cancelada'].includes(atual.estado),'FISCAL_ESTADO_FINAL');
    const novoEstado=proximoEstadoFiscal({estadoAtual:atual.estado,resultado});
    // Grava exclusivamente na operação fiscal — jamais altera a venda.
    tx.update(ref,{estado:novoEstado,updatedAt:now,conciliacoes:[...eventos,{id:eventoId,estado:novoEstado,at:now}]});
    return {alterada:true,estado:novoEstado};
  });
}
