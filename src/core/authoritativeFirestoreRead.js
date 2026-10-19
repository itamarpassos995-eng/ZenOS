/**
 * Leitura autoritativa: NUNCA troca a origem para cache em operações críticas.
 * Só repete erros transitórios; permission-denied, limites e conflitos de schema
 * continuam falhando de forma explícita (fail-closed).
 */
const TRANSIENT_CODES = new Set(['unavailable', 'deadline-exceeded', 'aborted']);
export const isTransientFirestoreReadError = error => {
  const code = String(error?.code || '').toLowerCase().replace(/^firestore\//, '');
  if (TRANSIENT_CODES.has(code)) return true;
  // Firebase Web SDK pode representar indisponibilidade de rede como erro genérico.
  // Não capturar "permission denied", limites financeiros ou documento ausente.
  if (code && code !== 'unknown' && code !== 'internal') return false;
  const message = String(error?.message || '').toLowerCase();
  return /failed to get documents? from server|could not reach cloud firestore backend|network (request|error|connection) failed|networkerror when attempting to fetch resource/.test(message);
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Deve ser usado somente com getDoc(s)FromServer. NÃO confirma uma gravação.
 * Três tentativas no máximo, sem alterar estado nem fazer fallback de leitura.
 */
export async function authoritativeFirestoreRead(read, {
  retries = 2, waitFor = wait, delays = [250, 750],
} = {}) {
  if (typeof read !== 'function') throw new TypeError('Operação de leitura inválida');
  for (let attempt = 0; ; attempt++) {
    try { return await read(); }
    catch (error) {
      if (attempt >= retries || !isTransientFirestoreReadError(error)) throw error;
      await waitFor(delays[Math.min(attempt, delays.length - 1)] || 250);
    }
  }
}
