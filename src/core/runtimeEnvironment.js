const getHostname = () => {
  if (typeof window === 'undefined' || !window.location) return '';
  return String(window.location.hostname || '').toLowerCase();
};

const hostname = getHostname();
const localhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
const metaEnv = import.meta.env || {};
const nodeEmulator = typeof process !== 'undefined' && Boolean(process?.env?.FIRESTORE_EMULATOR_HOST || process?.env?.FIREBASE_AUTH_EMULATOR_HOST);
const modeHomologacao = metaEnv.MODE === 'homologacao' || metaEnv.VITE_ZENOS_ENV === 'homologacao' || nodeEmulator;
// Em homologação aberta pela LAN (ex.: celular em 192.168.x.x), o navegador deve
// alcançar os emuladores no mesmo host do PC que serviu o ZenOS. Em localhost,
// mantemos loopback. Nunca há fallback para o Firebase de produção.
const emulatorHost = String(
  metaEnv.VITE_ZENOS_EMULATOR_HOST || (localhost ? '127.0.0.1' : hostname) || '127.0.0.1'
).trim();

// ATT 01.1: localhost é SEMPRE homologação. Não existe bypass para produção no navegador local.
export const ZENOS_RUNTIME = Object.freeze({
  environment: (localhost || modeHomologacao) ? 'HOMOLOGACAO' : 'PRODUCAO',
  isHomologacao: localhost || modeHomologacao,
  isProduction: !(localhost || modeHomologacao),
  hostname,
  firebaseProjectId: (localhost || modeHomologacao) ? 'demo-zenos-local' : 'zenos-ac6b2',
  authEmulatorHost: emulatorHost,
  authEmulatorPort: 9099,
  firestoreEmulatorHost: emulatorHost,
  firestoreEmulatorPort: 8080,
  emulatorUiPort: 4000,
  storageNamespace: (localhost || modeHomologacao) ? 'zenos_hml__' : '',
});

export const runtimeStorageKey = (key) => {
  const original = String(key || '');
  return ZENOS_RUNTIME.isHomologacao ? `${ZENOS_RUNTIME.storageNamespace}${original}` : original;
};
