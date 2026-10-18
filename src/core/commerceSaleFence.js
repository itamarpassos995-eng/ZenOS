import {doc} from 'firebase/firestore';

// A durable receipt in the SAME transaction as stock, cash and sale. Unlike
// recent-operation caches, this survives retries, other operators and pruning.
export async function lerTravaFaturamentoCommerce(tx, db, lojaId, guards = [], changes = []) {
  const list = guards.filter(g => g?.type === 'commerce_order_once');
  if (!list.length) return null;
  const g = list[0];
  const sale = changes.find(c => c.field === 'historicoVendas')?.value
    ?.find(v => v.id === g.saleId);
  if (list.length !== 1 || !/^[a-f0-9]{32}$/.test(g.orderId || '') ||
      g.saleId !== `COMMERCE-${g.orderId}` || sale?.commercePedidoId !== g.orderId ||
      sale?.origem !== 'commerce' || sale?.estado !== 'concluida') {
    throw Object.assign(new Error('Vínculo entre pedido e venda inválido.'), {code:'ZENOS_COMMERCE_SALE_INVALID'});
  }
  const ref = doc(db, 'lojas', String(lojaId), 'commerce_faturamentos', g.orderId);
  const snap = await tx.get(ref);
  if (snap.exists()) throw Object.assign(new Error('Este pedido já foi faturado. Consulte o pedido antes de continuar.'),
    {code:'ZENOS_COMMERCE_ALREADY_BILLED'});
  return {ref, value:{pedidoId:g.orderId, vendaId:g.saleId, criadoEm:sale.createdAt}};
}

export function gravarTravaFaturamentoCommerce(tx, trava) {
  if (trava) tx.set(trava.ref, trava.value);
}
