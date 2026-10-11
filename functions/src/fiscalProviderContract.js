// Fiscal 3B.4 — contrato de integração server-side, SEM transporte ou emissão ativados.
// O provedor efetivo deverá validar certificados, payload legal e respostas oficiais.
import { createHash } from 'node:crypto';

export class FiscalProviderError extends Error {
  constructor(code) { super(code); this.name = 'FiscalProviderError'; this.code = code; }
}
const exigir = (condition, code) => { if (!condition) throw new FiscalProviderError(code); };
const id = value => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,180}$/.test(value);
const tiposPais = Object.freeze({ BR:['nfe','nfce','nfse'], PY:['factura_electronica'] });
const ambientes = Object.freeze(['homologacao','producao']);
const operacoes = Object.freeze(['emitir','consultar','cancelar']);
const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);

// Usa apenas identificadores de negócio. Nenhum dado fiscal sensível é registrado na chave.
export function criarChaveProvedorFiscal({lojaId, vendaId, pais, tipoDocumento, ambiente, operacao, referencia=null}) {
  exigir(id(lojaId) && id(vendaId), 'FISCAL_IDENTIDADE_INVALIDA');
  exigir(tiposPais[pais]?.includes(tipoDocumento), 'FISCAL_TIPO_PAIS_INVALIDO');
  exigir(ambientes.includes(ambiente), 'FISCAL_AMBIENTE_INVALIDO');
  exigir(operacoes.includes(operacao), 'FISCAL_OPERACAO_INVALIDA');
  exigir(referencia === null || id(referencia), 'FISCAL_REFERENCIA_INVALIDA');
  exigir(operacao === 'emitir' ? referencia === null : referencia !== null, 'FISCAL_REFERENCIA_OBRIGATORIA');
  return createHash('sha256').update(JSON.stringify([lojaId,vendaId,pais,tipoDocumento,ambiente,operacao,referencia])).digest('hex');
}

export function prepararRequisicaoProvedorFiscal(input = {}) {
  const { lojaId, vendaId, pais, tipoDocumento, ambiente='homologacao', operacao='emitir', referencia=null, conteudoHash } = input;
  exigir(ambiente === 'homologacao', 'FISCAL_PRODUCAO_BLOQUEADA');
  exigir(hex64(conteudoHash), 'FISCAL_CONTEUDO_NAO_VERIFICADO');
  const chaveIdempotencia = criarChaveProvedorFiscal({lojaId,vendaId,pais,tipoDocumento,ambiente,operacao,referencia});
  return Object.freeze({versao:1,lojaId,vendaId,pais,tipoDocumento,ambiente,operacao,referencia,conteudoHash:conteudoHash.toLowerCase(),chaveIdempotencia,status:'aguardando_adaptador'});
}

// Recebe somente metadata não sensível. Uma resposta de provedor não equivale a autorização oficial.
export function validarRespostaTransporteFiscal(resposta, requisicao) {
  exigir(requisicao?.status === 'aguardando_adaptador', 'FISCAL_REQUISICAO_INVALIDA');
  exigir(resposta && typeof resposta === 'object' && !Array.isArray(resposta), 'FISCAL_RESPOSTA_INVALIDA');
  exigir(resposta.chaveIdempotencia === requisicao.chaveIdempotencia, 'FISCAL_CHAVE_DIVERGENTE');
  exigir(['recebido','indisponivel','rejeitado'].includes(resposta.status), 'FISCAL_STATUS_PROVEDOR_INVALIDO');
  // Jamais marca autorizado: isso exige recibo oficial validado por adaptador homologado.
  return Object.freeze({chaveIdempotencia:requisicao.chaveIdempotencia,status:resposta.status,autorizado:false});
}

// Fail closed: nenhum provedor configurado pode emitir notas, mesmo com dados cadastrais completos.
export async function transmitirFiscalDesativado() {
  throw new FiscalProviderError('FISCAL_PROVEDOR_NAO_CONFIGURADO');
}
