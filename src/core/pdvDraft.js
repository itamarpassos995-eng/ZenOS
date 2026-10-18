import { zenosStorage } from './storage.js';

// Rascunho exclusivo deste navegador, loja e operador. Nunca é uma venda confirmada.
export const chaveRascunhoPDV = (lojaId, operadorId) =>
  lojaId ? `zenos_${String(lojaId)}_pdv_rascunho_${String(operadorId || 'admin')}` : null;

const camposPesados = /imagem|foto|banner|base64|dataurl|thumbnail/i;
export const compactarItensPDV = (itens = []) =>
  (Array.isArray(itens) ? itens : []).map(item =>
    Object.fromEntries(Object.entries(item || {}).filter(([campo, valor]) =>
      !camposPesados.test(campo) && typeof valor !== 'function' && valor !== undefined)));

export function lerRascunhoPDV(lojaId, operadorId) {
  const chave = chaveRascunhoPDV(lojaId, operadorId);
  if (!chave) return null;
  try {
    const salvo = JSON.parse(zenosStorage.getItem(chave) || 'null');
    if (!salvo || salvo.schema !== 1 || salvo.lojaId !== String(lojaId) ||
        salvo.operadorId !== String(operadorId || 'admin') || !Array.isArray(salvo.itensVenda)) return null;
    return salvo;
  } catch (_) { return null; }
}

export function salvarRascunhoPDV(lojaId, operadorId, rascunho) {
  const chave = chaveRascunhoPDV(lojaId, operadorId);
  if (!chave) return false;
  // Evita manter atendimento vazio, sem intenção de venda.
  if (!rascunho?.itensVenda?.length && !rascunho?.prePedidoEmAbertoId && !rascunho?.commerceOrigem) {
    return zenosStorage.removeItem(chave);
  }
  return zenosStorage.setItem(chave, JSON.stringify({
    schema: 1, lojaId: String(lojaId), operadorId: String(operadorId || 'admin'),
    atualizadoEm: new Date().toISOString(),
    ...rascunho,
    itensVenda: compactarItensPDV(rascunho.itensVenda),
  }));
}

export function apagarRascunhoPDV(lojaId, operadorId) {
  const chave = chaveRascunhoPDV(lojaId, operadorId);
  return chave ? zenosStorage.removeItem(chave) : false;
}
