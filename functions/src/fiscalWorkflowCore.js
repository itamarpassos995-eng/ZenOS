// Orquestrador fiscal puro e fail-closed. NÃO envia documentos ou grava no banco.
// Somente backend confiável pode fornecer os comprovantes de autenticação/homologação.
export const FISCAL_ETAPAS = Object.freeze(['preparado','aguardando_provedor','transmitindo','autorizado','rejeitado','cancelado']);
export class FiscalWorkflowError extends Error {
  constructor(code) { super(code); this.name='FiscalWorkflowError'; this.code=code; }
}
const exigir = (ok,code) => { if(!ok) throw new FiscalWorkflowError(code); };
const idValido = x => typeof x === 'string' && x.length>0 && x.length<=180 && /^[a-zA-Z0-9._:-]+$/.test(x);
const ambienteValido = x => x === 'homologacao' || x === 'producao';
const estados = Object.freeze({
  preparado:['aguardando_provedor'],
  aguardando_provedor:['transmitindo','rejeitado'],
  transmitindo:['autorizado','rejeitado'],
  rejeitado:['aguardando_provedor'],
  autorizado:['cancelado'],
  cancelado:[],
});
export function criarSolicitacaoFiscal({lojaId,vendaId,tipoDocumento,ambiente='homologacao',prontidao,actorUid}={}) {
  exigir(idValido(lojaId)&&idValido(vendaId)&&idValido(actorUid),'FISCAL_IDENTIDADE_INVALIDA');
  exigir(['nfe','nfce','nfse','factura_electronica'].includes(tipoDocumento),'FISCAL_TIPO_INVALIDO');
  exigir(ambienteValido(ambiente),'FISCAL_AMBIENTE_INVALIDO');
  exigir(ambiente==='homologacao','FISCAL_PRODUCAO_BLOQUEADA');
  exigir(prontidao?.apto===true && Array.isArray(prontidao.pendencias) && prontidao.pendencias.length===0,'FISCAL_PRONTIDAO_PENDENTE');
  const chave = JSON.stringify([lojaId,vendaId,tipoDocumento,ambiente]);
  return {chave,lojaId,vendaId,tipoDocumento,ambiente,actorUid,estado:'preparado',revisao:0,eventos:[],protocolo:null};
}
export function aplicarResultadoFiscal({solicitacao,evento}={}) {
  exigir(solicitacao && idValido(solicitacao.lojaId) && Array.isArray(solicitacao.eventos),'FISCAL_SOLICITACAO_INVALIDA');
  exigir(evento && idValido(evento.id) && typeof evento.estado==='string','FISCAL_EVENTO_INVALIDO');
  exigir(evento.lojaId===solicitacao.lojaId && evento.chave===solicitacao.chave,'FISCAL_LOJA_DIVERGENTE');
  const anterior=solicitacao.eventos.find(e=>e.id===evento.id);
  if(anterior) {
    exigir(anterior.estado===evento.estado && anterior.protocolo===(evento.protocolo??null),'FISCAL_EVENTO_CONFLITANTE');
    return structuredClone(solicitacao);
  }
  exigir(estados[solicitacao.estado]?.includes(evento.estado),'FISCAL_TRANSICAO_INVALIDA');
  exigir(evento.estado!=='autorizado' && evento.estado!=='cancelado','FISCAL_RETORNO_OFICIAL_NAO_VERIFICADO');
  // Autorização e cancelamento só podem ocorrer em adapter oficial verificado.
  const registro={id:evento.id,estado:evento.estado,protocolo:null};
  return {...structuredClone(solicitacao),estado:evento.estado,revisao:solicitacao.revisao+1,eventos:[...structuredClone(solicitacao.eventos),registro]};
}
