import { V2_COLLECTIONS, encodeV2Id, entityIdV2, v2Error } from './operationalV2Schema.js';
import { syncValuesEqual } from './syncMerge.js';

const indexar = (field, items) => new Map((Array.isArray(items) ? items : []).map(item =>
  [encodeV2Id(entityIdV2(field, item)), item]));

const descricoes = Object.freeze({
  produtos: 'Produto',
  clientes: 'Cliente',
  historicoVendas: 'Documento comercial',
  historicoCompras: 'Compra',
  vouchers: 'Voucher',
  sessoesCaixa: 'Sessão de caixa',
  caixaMovimentos: 'Movimento de caixa',
  fornecedores: 'Fornecedor',
  vendedores: 'Operador',
  despesas: 'Despesa',
});

/**
 * V2: um registro excluído (tombstone) nunca pode reaparecer via merge de uma
 * base local atrasada. Dados inalterados e removidos remotamente são ignorados.
 * Se o comando realmente tenta editar/recriar esse registro, bloquear TODO o
 * commit: descartar a edição poderia perder venda, estoque, fiado ou histórico.
 * A guarda final V2_REUSE_ID permanece ativa como defesa adicional.
 */
export function reconciliarExclusoesV2({field, baseValue, localValue, mergedValue, records}) {
  if (!V2_COLLECTIONS[field] || !Array.isArray(mergedValue) || !records?.size) return mergedValue;
  const base = indexar(field, baseValue);
  const local = indexar(field, localValue);
  let filtrados = null;
  for (let index = 0; index < mergedValue.length; index += 1) {
    const item = mergedValue[index];
    const encoded = encodeV2Id(entityIdV2(field, item));
    if (!records.get(encoded)?.deleted) {
      if (filtrados) filtrados.push(item);
      continue;
    }
    const localAlterou = local.has(encoded) &&
      (!base.has(encoded) || !syncValuesEqual(local.get(encoded),base.get(encoded)));
    if (localAlterou) {
      const entidade = descricoes[field] || 'Registro';
      const error = v2Error('ZENOS_ENTITY_DELETED_REMOTE',
        `${entidade} não está mais disponível no cadastro da nuvem. Nenhum dado foi gravado. Atualize os dados e revise este item antes de concluir.`);
      error.field = field;
      error.entityId = entityIdV2(field, item);
      throw error;
    }
    if (!filtrados) filtrados = mergedValue.slice(0, index);
  }
  return filtrados || mergedValue;
}
