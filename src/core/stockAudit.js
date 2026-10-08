import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { dataMinimaHistoricoPlano, obterPoliticaHistoricoEstoque } from './stockAuditCore';
import { chaveAuditoriaProduto, normalizarSkuProduto } from './productIdentity.js';
import { notifyPersistenceStatus } from './persistenceSafety.js';

export { criarEventoEstoque, dataMinimaHistoricoPlano, historicoPermitidoPeloPlano, normalizarPlanoHistorico, obterPoliticaHistoricoEstoque } from './stockAuditCore';

const limparIdFirestore = (valor) => String(valor ?? 'sem-id').replaceAll('/', '_');

const movimentoRef = (db, userId, evento) => doc(
  db,
  'lojas', String(userId),
  'estoque_auditoria', limparIdFirestore(evento.produtoAuditKey || chaveAuditoriaProduto(evento.produtoId, evento.sku)),
  'movimentos', limparIdFirestore(evento.id),
);

export const registrarEventosEstoque = async ({ db, userId, eventos = [] }) => {
  const validos = (eventos || []).filter((evento) => evento?.produtoId != null && evento?.id);
  if (validos.length === 0) return { gravados: 0 };
  if (!userId) {
    const erro = new Error('Não foi possível identificar a loja para registrar a auditoria de estoque.');
    erro.code = 'ZENOS_AUDITORIA_SEM_USUARIO';
    throw erro;
  }

  notifyPersistenceStatus({ status:'SALVANDO', field:'estoque_auditoria' });
  const batch = writeBatch(db);
  validos.forEach((evento) => batch.set(movimentoRef(db, userId, evento), { ...evento, serverRecordedAt: serverTimestamp() }, { merge: false }));
  try {
    await batch.commit();
    notifyPersistenceStatus({ status:'SINCRONIZADO', field:'estoque_auditoria' });
    return { gravados: validos.length };
  } catch (error) {
    notifyPersistenceStatus({ status:'ERRO', field:'estoque_auditoria', error:error?.message||String(error) });
    throw error;
  }
};

export const carregarHistoricoEstoqueProduto = async ({ db, userId, produtoId, produtoSku = '', plano = 'basico', inicio = null, fim = null }) => {
  if (!userId || produtoId == null) return [];
  const politica = obterPoliticaHistoricoEstoque(plano);
  const minimoPlano = dataMinimaHistoricoPlano(plano);
  const inicioSolicitado = inicio ? new Date(`${inicio}T00:00:00`) : minimoPlano;
  const inicioEfetivo = inicioSolicitado > minimoPlano ? inicioSolicitado : minimoPlano;

  const executar = async (chave) => {
    const ref = collection(db, 'lojas', String(userId), 'estoque_auditoria', limparIdFirestore(chave), 'movimentos');
    const q = query(
      ref,
      where('createdAt', '>=', inicioEfetivo.toISOString()),
      orderBy('createdAt', 'desc'),
      limit(politica.limite),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  };

  const chaveNova = chaveAuditoriaProduto(produtoId, produtoSku);
  const chaveLegada = String(produtoId);
  const listas = await Promise.all([
    executar(chaveNova),
    chaveNova !== chaveLegada ? executar(chaveLegada).catch(() => []) : Promise.resolve([]),
  ]);

  const skuNorm = normalizarSkuProduto(produtoSku);
  const mapa = new Map();
  listas.flat().forEach((item) => {
    if (skuNorm && item?.sku && normalizarSkuProduto(item.sku) !== skuNorm) return;
    mapa.set(String(item.id), item);
  });
  let lista = [...mapa.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, politica.limite);

  if (fim) {
    const limiteFim = new Date(`${fim}T23:59:59.999`);
    lista = lista.filter((item) => new Date(item.createdAt) <= limiteFim);
  }
  return lista;
};
