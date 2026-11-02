// ZenOS AutoUpdate V1: consulta apenas /version.json (asset estático Vercel), nunca o Firestore.
// Fail-closed: sem sinal explícito de segurança vindo do App, NUNCA recarrega.
export const UPDATE_SAFETY_EVENT = 'zenos:auto-update-safety';
const SHA_RE = /^[0-9a-f]{40}$/i;
const validSha = value => typeof value === 'string' && SHA_RE.test(value);
let safetyProvider = null;

export function registerAutoUpdateSafetyProvider(provider) {
  if (typeof provider !== 'function') throw new TypeError('Safety provider required');
  safetyProvider = provider;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(UPDATE_SAFETY_EVENT));
  return () => {
    if (safetyProvider === provider) safetyProvider = null;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(UPDATE_SAFETY_EVENT));
  };
}

export function createAutoUpdateController({
  currentVersion,
  win = globalThis.window,
  doc = globalThis.document,
  fetcher = globalThis.fetch,
  isSafe = () => safetyProvider?.() === true,
  now = Date.now,
  stableMs = 90_000,
  pollEveryMs = 15 * 60_000,
  minimumPollGapMs = 60_000,
} = {}) {
  let pendingVersion = null;
  let safeSince = null;
  let lastPollAt = -Infinity;
  let inFlight = false;
  let stopped = false;
  let reloading = false;
  let intervalId = null;
  let initialId = null;
  const canRun = validSha(currentVersion) && !!win && !!doc && typeof fetcher === 'function';

  function safeNow() {
    if (stopped || reloading || !canRun || !pendingVersion) return false;
    if (doc.visibilityState !== 'visible' || win.navigator?.onLine === false) return false;
    if (doc.activeElement?.matches?.('input, textarea, select, [contenteditable="true"]')) return false;
    try { return isSafe() === true; } catch { return false; }
  }

  function evaluate() {
    if (!safeNow()) { safeSince = null; return false; }
    const timestamp = now();
    if (safeSince === null) safeSince = timestamp;
    if (timestamp - safeSince < stableMs) return false;
    // Última checagem imediatamente antes do reload: operação pode ter começado.
    if (!safeNow()) { safeSince = null; return false; }
    reloading = true;
    win.location.reload(); // Nunca remove cache offline, IndexedDB ou localStorage.
    return true;
  }

  async function poll({force = false} = {}) {
    if (!canRun || stopped || inFlight || win.navigator?.onLine === false) return false;
    if (doc.visibilityState !== 'visible') return false;
    if (!force && now() - lastPollAt < minimumPollGapMs) return false;
    lastPollAt = now();
    inFlight = true;
    try {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeout = controller ? setTimeout(() => controller.abort(), 8_000) : null;
      try {
        const response = await fetcher('/version.json', {
          method: 'GET', cache: 'no-store', credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          ...(controller ? { signal: controller.signal } : {}),
        });
        if (!response?.ok) return false;
        const payload = await response.json();
        const remote = payload?.version;
        if (!validSha(remote)) return false;
        if (remote.toLowerCase() === currentVersion.toLowerCase()) {
          pendingVersion = null;
          safeSince = null;
        } else if (pendingVersion !== remote.toLowerCase()) {
          pendingVersion = remote.toLowerCase();
          safeSince = null;
        }
        return evaluate();
      } finally { if (timeout) clearTimeout(timeout); }
    } catch {
      // Rede fora, deploy transitório ou JSON inválido: sem reload e sem erro na venda.
      return false;
    } finally { inFlight = false; }
  }

  function onFocus() { void poll(); evaluate(); }
  function onVisibility() { if (doc.visibilityState === 'visible') onFocus(); else evaluate(); }
  function start() {
    if (!canRun || stopped || intervalId !== null) return;
    win.addEventListener(UPDATE_SAFETY_EVENT, evaluate);
    win.addEventListener('focus', onFocus);
    win.addEventListener('online', onFocus);
    doc.addEventListener('visibilitychange', onVisibility);
    initialId = setTimeout(() => { void poll(); }, 15_000);
    intervalId = setInterval(() => {
      evaluate();
      if (now() - lastPollAt >= pollEveryMs) void poll();
    }, 15_000);
  }
  function stop() {
    stopped = true;
    if (initialId !== null) clearTimeout(initialId);
    if (intervalId !== null) clearInterval(intervalId);
    intervalId = null;
    win?.removeEventListener?.(UPDATE_SAFETY_EVENT, evaluate);
    win?.removeEventListener?.('focus', onFocus);
    win?.removeEventListener?.('online', onFocus);
    doc?.removeEventListener?.('visibilitychange', onVisibility);
  }
  return { start, stop, poll, evaluate, getPendingVersion: () => pendingVersion };
}

export function startAutoUpdate(currentVersion) {
  const controller = createAutoUpdateController({ currentVersion });
  controller.start();
  return controller;
}
