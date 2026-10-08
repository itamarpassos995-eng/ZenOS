import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { criarLancamentoFinanceiro } from './financialLedgerCore';
import { notifyPersistenceStatus } from './persistenceSafety.js';

const COLECAO = 'financeiro_livro';
export { criarLancamentoFinanceiro, formaEhDinheiro } from './financialLedgerCore';

export async function registrarLancamentoFinanceiro({ db, userId, lancamento }) {
  const normalizado = criarLancamentoFinanceiro({ ...lancamento, lojaId: userId || lancamento?.lojaId });
  notifyPersistenceStatus({ status:'SALVANDO', field:'financeiro_livro' });
  try {
    await setDoc(doc(db, 'lojas', String(userId), COLECAO, normalizado.id), { ...normalizado, serverRecordedAt: serverTimestamp() }, { merge: true });
    notifyPersistenceStatus({ status:'SINCRONIZADO', field:'financeiro_livro' });
    return normalizado;
  } catch (error) {
    notifyPersistenceStatus({ status:'ERRO', field:'financeiro_livro', error:error?.message||String(error) });
    throw error;
  }
}

export async function registrarLancamentosFinanceiros({ db, userId, lancamentos = [] }) {
  const saida = [];
  for (const lancamento of lancamentos) {
    if (!lancamento || !(Number(lancamento.valor) > 0)) continue;
    saida.push(await registrarLancamentoFinanceiro({ db, userId, lancamento }));
  }
  return saida;
}

export function assinarLivroFinanceiro({ db, userId, onData, onError }) {
  if (!userId) return () => {};
  return onSnapshot(collection(db, 'lojas', String(userId), COLECAO), (snap) => {
    const itens = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    itens.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    onData?.(itens, { fromCache: snap.metadata?.fromCache === true });
  }, (erro) => onError?.(erro));
}

export function lancamentosDoCliente(livro = [], clienteId) {
  if (!clienteId) return [];
  return (livro || [])
    .filter(l => String(l.clienteId || '') === String(clienteId))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
