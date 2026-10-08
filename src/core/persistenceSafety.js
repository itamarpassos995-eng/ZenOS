import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { zenosStorage } from './storage.js';

export const PERSISTENCE_STATUS_EVENT = 'zenos:persistence-status';
export const V1_SCHEMA_VERSION = 1;

export const getV1OperationPath = (userId) => ['lojas', userId, 'dados', 'operacao'];

export const notifyPersistenceStatus = (detail) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(PERSISTENCE_STATUS_EVENT, { detail }));
  } catch (error) {
    console.error('[ZenOS Persistence] Falha ao emitir status de persistência:', error);
  }
};

export const inspectLocalSchemaVersion = (currentVersion = V1_SCHEMA_VERSION) => {
  let savedVersion = 0;
  try {
    savedVersion = Number.parseInt(zenosStorage.getItem('zenos_schema_version') || '0', 10) || 0;
  } catch (error) {
    console.error('[ZenOS Schema] Não foi possível ler a versão local:', error);
    return { savedVersion: 0, currentVersion, needsMigration: false, readError: true };
  }

  const needsMigration = savedVersion < currentVersion;
  if (needsMigration) {
    console.warn(
      `[ZenOS Schema] Versão local v${savedVersion} anterior à v${currentVersion}. ` +
      'Nenhuma migração foi executada automaticamente.'
    );
  }

  return { savedVersion, currentVersion, needsMigration, readError: false };
};

export const safeSetLocalJson = (key, value) => {
  if (!key) return { ok: false, error: new Error('Chave localStorage ausente.') };
  const localOk = zenosStorage.setItem(key, JSON.stringify(value));
  if (localOk) return { ok: true, error: null };

  const error = new Error(`Falha ao salvar cache local "${key}".`);
  console.error('[ZenOS Persistence]', error);
  return { ok: false, error };
};

/**
 * Persiste UM campo da estrutura V1 sem alterar o formato do documento.
 * - Mantém o caminho V1: lojas/{uid}/dados/operacao
 * - Mantém setDoc(..., { merge: true }) para não substituir outros campos.
 * - Nunca apaga/move dados e nunca executa migração.
 * - Expõe status por evento para futura UI de sincronização.
 */
export const persistV1OperationField = async ({ db, userId, field, value, localStorageKey }) => {
  if (!db || !userId || !field) {
    const error = new Error('Persistência V1 chamada sem db, userId ou field.');
    console.error('[ZenOS Persistence]', error);
    notifyPersistenceStatus({ status: 'ERRO', field, localStorageKey, error: error.message });
    return { ok: false, localOk: false, cloudOk: false, error };
  }

  notifyPersistenceStatus({ status: 'SALVANDO', field, localStorageKey });

  const localResult = localStorageKey
    ? safeSetLocalJson(localStorageKey, value)
    : { ok: true, error: null };

  try {
    await setDoc(doc(db, ...getV1OperationPath(userId)), { [field]: value, _syncMeta: { lastField: field, updatedAtClient: new Date().toISOString(), updatedAtServer: serverTimestamp() } }, { merge: true });
    const status = localResult.ok ? 'SINCRONIZADO' : 'ERRO';
    notifyPersistenceStatus({ status, field, localStorageKey, localOk: localResult.ok, cloudOk: true });
    return { ok: localResult.ok, localOk: localResult.ok, cloudOk: true, error: localResult.error };
  } catch (error) {
    console.error(`[ZenOS Persistence] Falha ao sincronizar o campo "${field}" na V1:`, error);
    const status = localResult.ok ? 'PENDENTE' : 'ERRO';
    notifyPersistenceStatus({ status, field, localStorageKey, localOk: localResult.ok, cloudOk: false, error: error?.message || String(error) });
    return { ok: false, localOk: localResult.ok, cloudOk: false, error };
  }
};
