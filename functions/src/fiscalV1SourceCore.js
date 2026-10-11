// Adaptador de leitura da origem autoritativa V1; não escreve nem altera vendas.
export class FiscalSourceError extends Error {
  constructor(code) { super(code); this.name = 'FiscalSourceError'; this.code = code; }
}
const exigir = (ok, code) => { if (!ok) throw new FiscalSourceError(code); };
const idSeguro = v => typeof v === 'string' && v.length > 0 && v.length <= 200 && !v.includes('/');
export function extrairVendaFiscalV1({lojaId, vendaId, documentoOperacao, documentoConfiguracoes} = {}) {
  exigir(idSeguro(lojaId) && idSeguro(vendaId), 'FISCAL_ID_INVALIDO');
  exigir(documentoOperacao && typeof documentoOperacao === 'object' && !Array.isArray(documentoOperacao), 'FISCAL_ORIGEM_INDISPONIVEL');
  exigir(Array.isArray(documentoOperacao.historicoVendas), 'FISCAL_HISTORICO_INDISPONIVEL');
  const correspondentes = documentoOperacao.historicoVendas.filter(v => v && String(v.id) === vendaId);
  exigir(correspondentes.length === 1, correspondentes.length ? 'FISCAL_VENDA_AMBIGUA' : 'FISCAL_VENDA_NAO_ENCONTRADA');
  const venda = correspondentes[0];
  exigir(venda.lojaId == null || String(venda.lojaId) === lojaId, 'FISCAL_LOJA_DIVERGENTE');
  exigir(documentoConfiguracoes && typeof documentoConfiguracoes === 'object' && !Array.isArray(documentoConfiguracoes), 'FISCAL_PERFIL_INDISPONIVEL');
  exigir(documentoConfiguracoes.perfilLoja && typeof documentoConfiguracoes.perfilLoja === 'object', 'FISCAL_PERFIL_INDISPONIVEL');
  // Devolve cópia para impedir que preparação fiscal altere a fonte comercial.
  return structuredClone({lojaId, venda, perfilLoja: documentoConfiguracoes.perfilLoja});
}
export function caminhosFonteFiscalV1(lojaId) {
  exigir(idSeguro(lojaId), 'FISCAL_ID_INVALIDO');
  return Object.freeze({
    operacao: `lojas/${lojaId}/dados/operacao`,
    configuracoes: `lojas/${lojaId}/dados/configuracoes`,
  });
}
