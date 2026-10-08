import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { BACKUP_VERSION, montarBackup, validarBackup } from './backupCore.js';
import { chaveAuditoriaProduto } from './productIdentity.js';
import { ZENOS_RUNTIME } from './runtimeEnvironment.js';

const limparId = (valor) => String(valor ?? 'sem-id').replaceAll('/', '_');

async function lerColecao(ref) {
  const snap = await getDocs(ref);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function lerAuditoriaEstoque({ db, userId, produtos = [] }) {
  const grupos = [];
  const chaves = new Map();
  for (const p of produtos || []) {
    const id = p?.id ?? p?.produtoOriginalId;
    if (id == null) continue;
    const nova = chaveAuditoriaProduto(id, p?.sku || '');
    chaves.set(nova, { produtoId: id, sku: p?.sku || '' });
    chaves.set(String(id), { produtoId: id, sku: p?.sku || '', legado: true });
  }
  for (const [auditKey, meta] of chaves.entries()) {
    try {
      const ref = collection(db, 'lojas', String(userId), 'estoque_auditoria', limparId(auditKey), 'movimentos');
      const movimentos = await lerColecao(ref);
      if (movimentos.length) grupos.push({ auditKey, ...meta, movimentos });
    } catch (error) {
      console.warn('[ZenOS Backup] Histórico de estoque não pôde ser lido:', auditKey, error);
    }
  }
  return grupos;
}

export async function coletarBackupLoja({ db, userId, operadorNome = 'Administrador' }) {
  if (!db || !userId) throw new Error('Loja não identificada para backup.');
  const [rootSnap, operacaoSnap, configSnap, mesasSnap, financeiroLivro, produtoIndices] = await Promise.all([
    getDoc(doc(db, 'lojas', String(userId))),
    getDoc(doc(db, 'lojas', String(userId), 'dados', 'operacao')),
    getDoc(doc(db, 'lojas', String(userId), 'dados', 'configuracoes')),
    getDoc(doc(db, 'lojas', String(userId), 'dados', 'mesas')),
    lerColecao(collection(db, 'lojas', String(userId), 'financeiro_livro')),
    lerColecao(collection(db, 'lojas', String(userId), 'produto_indices')),
  ]);
  const operacao = operacaoSnap.exists() ? operacaoSnap.data() : {};
  const estoqueAuditoria = await lerAuditoriaEstoque({ db, userId, produtos: operacao.produtos || [] });
  return montarBackup({
    lojaId: userId,
    createdBy: operadorNome,
    zenosVersion: '1.0.0-ATT09',
    schemaVersion: 1,
    dados: {
      rootLoja: rootSnap.exists() ? rootSnap.data() : {},
      operacao,
      configuracoes: configSnap.exists() ? configSnap.data() : {},
      mesas: mesasSnap.exists() ? mesasSnap.data() : {},
      financeiroLivro,
      produtoIndices,
      estoqueAuditoria,
    },
  });
}

export function baixarBackupJson(backup) {
  const conteudo = JSON.stringify(backup, null, 2);
  const blob = new Blob([conteudo], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const data = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  a.href = url;
  a.download = `ZenOS-backup-${backup?.metadata?.lojaId || 'loja'}-${data}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function destinoHomologacaoEstaVazio({ db, userId }) {
  const [op, fin, mesas] = await Promise.all([
    getDoc(doc(db, 'lojas', String(userId), 'dados', 'operacao')),
    getDocs(query(collection(db, 'lojas', String(userId), 'financeiro_livro'), limit(1))),
    getDoc(doc(db, 'lojas', String(userId), 'dados', 'mesas')),
  ]);
  const d = op.exists() ? op.data() : {};
  const camposArray = ['produtos','clientes','historicoVendas','historicoCompras','caixaMovimentos','despesas','fornecedores','vouchers','sessoesCaixa'];
  const opVazia = !op.exists() || camposArray.every(k => !Array.isArray(d[k]) || d[k].length === 0);
  const mesasVazias = !mesas.exists() || !Array.isArray(mesas.data()?.mesas) || mesas.data().mesas.every(m => !Array.isArray(m?.itens) || m.itens.length === 0);
  return opVazia && fin.empty && mesasVazias;
}

export async function restaurarBackupSomenteHomologacao({ db, userId, backup }) {
  if (!ZENOS_RUNTIME.isHomologacao) throw new Error('Restauração de backup é bloqueada fora da homologação.');
  const validacao = await validarBackup(backup);
  if (!validacao.ok) throw new Error(validacao.erros.join(' '));
  if (!await destinoHomologacaoEstaVazio({ db, userId })) throw new Error('A restauração só é permitida em uma loja de homologação vazia.');

  const data = backup.data || {};
  await setDoc(doc(db, 'lojas', String(userId)), { ...(data.rootLoja || {}), restoredFromBackup: BACKUP_VERSION, restoredAtServer: serverTimestamp() }, { merge: true });
  await setDoc(doc(db, 'lojas', String(userId), 'dados', 'operacao'), data.operacao || {}, { merge: false });
  await setDoc(doc(db, 'lojas', String(userId), 'dados', 'configuracoes'), data.configuracoes || {}, { merge: false });
  if (data.mesas && Object.keys(data.mesas).length) await setDoc(doc(db, 'lojas', String(userId), 'dados', 'mesas'), data.mesas, { merge: false });

  const documentos = [];
  for (const l of data.financeiroLivro || []) documentos.push({ ref: doc(db, 'lojas', String(userId), 'financeiro_livro', String(l.id)), value: l });
  for (const idx of data.produtoIndices || []) documentos.push({ ref: doc(db, 'lojas', String(userId), 'produto_indices', String(idx.id)), value: idx });
  for (const grupo of data.estoqueAuditoria || []) {
    for (const mov of grupo.movimentos || []) {
      documentos.push({ ref: doc(db, 'lojas', String(userId), 'estoque_auditoria', limparId(grupo.auditKey), 'movimentos', limparId(mov.id)), value: mov });
    }
  }
  for (let i = 0; i < documentos.length; i += 400) {
    const batch = writeBatch(db);
    documentos.slice(i, i + 400).forEach(item => batch.set(item.ref, item.value, { merge: false }));
    await batch.commit();
  }
  return { ok: true, counts: validacao.counts };
}
