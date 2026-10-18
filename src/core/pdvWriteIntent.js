import { v2Error } from './operationalV2Schema.js';

// Uma venda nova é um append de um único documento. Nunca deve reenviar toda
// a lista de histórico que estava renderizada no caixa (pode estar atrasada).
// Demais alterações históricas, como devoluções, seguem pelo fluxo próprio.
// Para conversão de pré-pedido, o removeEntityIds e os guards permanecem intactos.
export function projetarHistoricoNovaVendaPDV({ field, value, baseValue, operationKey }) {
  if (field !== 'historicoVendas' || typeof operationKey !== 'string' || !operationKey.startsWith('pdv:')) {
    return value;
  }
  if (!Array.isArray(baseValue) || !Array.isArray(value)) {
    throw v2Error('ZENOS_PDV_HISTORY_BASE', 'Histórico não sincronizado. A venda não foi gravada; mantenha o carrinho aberto.');
  }
  const vendaId = operationKey.slice(4);
  const criados = value.filter(item => String(item?.id ?? '') === vendaId);
  if (!vendaId || criados.length !== 1) {
    throw v2Error('ZENOS_PDV_HISTORY_INTENT', 'Documento da venda não identificado de forma única. A operação foi bloqueada.');
  }
  // Apenas o novo documento faz parte da intenção desta transação. O restante
  // vem da base sincronizada e o merge transacional preserva a nuvem mais nova.
  // Isso impede que o histórico visível, ainda que desatualizado, ressuscite
  // vendas e pré-pedidos removidos em outro caixa.
  const anterior = baseValue.filter(item => String(item?.id ?? '') !== vendaId);
  return [criados[0], ...anterior];
}
