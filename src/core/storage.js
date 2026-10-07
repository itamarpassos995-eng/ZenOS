import { runtimeStorageKey, ZENOS_RUNTIME } from './runtimeEnvironment.js';

export const zenosStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(runtimeStorageKey(key));
    } catch (error) {
      console.error('[ZenOS Storage] Falha ao ler localStorage:', error);
      return null;
    }
  },

  setItem(key, value) {
    try {
      localStorage.setItem(runtimeStorageKey(key), value);
      return true;
    } catch (error) {
      console.error('[ZenOS Storage] Falha ao gravar localStorage:', error);
      return false;
    }
  },

  removeItem(key) {
    try {
      localStorage.removeItem(runtimeStorageKey(key));
      return true;
    } catch (error) {
      console.error('[ZenOS Storage] Falha ao remover localStorage:', error);
      return false;
    }
  },

  keyForDebug(key) {
    return runtimeStorageKey(key);
  },

  isIsolated: ZENOS_RUNTIME.isHomologacao,
};
