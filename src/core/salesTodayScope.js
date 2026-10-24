import { registroEhDoDiaLocal } from './dates.js';

// Somente escopo da interface: não altera históricos, caixa ou livro financeiro.
// A gerência vê o total da loja; cada vendedor vê seu vendedorId.
export function filtrarVendasHojeVisiveis({historicoVendas = [],operadorAtivo,patenteUsuario,referencia = new Date()} = {}) {
  if (!operadorAtivo?.id) return [];
  const gerencia = patenteUsuario === 'gerencia';
  return (Array.isArray(historicoVendas) ? historicoVendas : []).filter(v =>
    (v?.estado === 'concluida' || v?.estado === 'parcial')
    && registroEhDoDiaLocal(v, referencia)
    && (gerencia || String(v.vendedorId ?? '') === String(operadorAtivo.id))
  );
}
