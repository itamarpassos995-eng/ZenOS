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
  if (!rascunho?.itensVenda?.length && !rascunho?.prePedidoEmAbertoId) {
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

/**
 * Backup durável alternativo quando o localStorage do terminal esgota a quota.
 * Usa IndexedDB da MESMA origem (sem gravações adicionais no Firebase).
 * Falha fechada: se ambos os armazenamentos falharem a venda continua bloqueada.
 */
const IDB_NAME = 'zenos-pdv-protecao';
const IDB_STORE = 'rascunhos';
const abrirBanco = () => new Promise((resolve,reject)=>{
  if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponível'));
  const pedido = indexedDB.open(IDB_NAME,1);
  pedido.onupgradeneeded = () => {
    const banco = pedido.result;
    if (!banco.objectStoreNames.contains(IDB_STORE)) banco.createObjectStore(IDB_STORE);
  };
  pedido.onsuccess = () => resolve(pedido.result);
  pedido.onerror = () => reject(pedido.error || new Error('Falha ao abrir backup local'));
  pedido.onblocked = () => reject(new Error('Backup local bloqueado por outra janela'));
});
const executarBackup = async (chave,modo,valor) => {
  const banco=await abrirBanco();
  try {
    return await new Promise((resolve,reject)=>{
      const tx=banco.transaction(IDB_STORE,modo);
      const store=tx.objectStore(IDB_STORE);
      const pedido=modo==='readonly'?store.get(chave):valor===undefined?store.delete(chave):store.put(valor,chave);
      let resultado=null;
      pedido.onsuccess=()=>{resultado=pedido.result;};
      pedido.onerror=()=>reject(pedido.error || new Error('Falha na operação local'));
      tx.oncomplete=()=>resolve(resultado);
      tx.onerror=()=>reject(tx.error || new Error('Falha na transação local'));
      tx.onabort=()=>reject(tx.error || new Error('Backup local interrompido'));
    });
  } finally { banco.close(); }
};
const rascunhoNormalizado = (lojaId,operadorId,rascunho) => ({
  schema:1,lojaId:String(lojaId),operadorId:String(operadorId || 'admin'),
  atualizadoEm:new Date().toISOString(),
  ...rascunho,itensVenda:compactarItensPDV(rascunho.itensVenda),
});
const correspondeAoOperador = (v,lojaId,operadorId) =>
  v?.schema===1 && v.lojaId===String(lojaId) &&
  v.operadorId===String(operadorId || 'admin') && Array.isArray(v.itensVenda);

export async function salvarRascunhoPDVProtegido(lojaId,operadorId,rascunho) {
  const chave=chaveRascunhoPDV(lojaId,operadorId);
  if (!chave) return false;
  if (salvarRascunhoPDV(lojaId,operadorId,rascunho)) return true;
  try {
    await executarBackup(chave,'readwrite',rascunhoNormalizado(lojaId,operadorId,rascunho));
    return true;
  } catch(error) {
    console.error('[ZenOS PDV] Ambos os armazenamentos locais falharam; venda protegida por bloqueio.',error);
    return false;
  }
}

export async function lerRascunhoPDVRecuperavel(lojaId,operadorId) {
  const local=lerRascunhoPDV(lojaId,operadorId);
  const chave=chaveRascunhoPDV(lojaId,operadorId);
  if(!chave)return local;
  try {
    const registro=await executarBackup(chave,'readonly');
    const alternativo=correspondeAoOperador(registro,lojaId,operadorId)?registro:null;
    // Se o localStorage estava cheio, ele pode conter uma versão antiga válida.
    // O backup mais recente deve prevalecer para não perder itens do atendimento.
    if(!alternativo)return local;
    return !local || Date.parse(alternativo.atualizadoEm||0)>Date.parse(local.atualizadoEm||0) ? alternativo : local;
  }catch(error){
    console.warn('[ZenOS PDV] Não foi possível recuperar o backup alternativo.',error);
    return local;
  }
}

export async function apagarRascunhoPDVProtegido(lojaId,operadorId) {
  const chave=chaveRascunhoPDV(lojaId,operadorId);
  if(!chave)return false;
  const local=apagarRascunhoPDV(lojaId,operadorId);
  try { await executarBackup(chave,'readwrite');return true; }
  catch(error){console.warn('[ZenOS PDV] Falha ao limpar backup alternativo após confirmação.',error);return local;}
}
