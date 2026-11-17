import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, browserSessionPersistence, connectAuthEmulator } from "firebase/auth";
import { initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getAnalytics } from "firebase/analytics";
import { ZENOS_RUNTIME } from './core/runtimeEnvironment';

const productionFirebaseConfig = {
  apiKey: "AIzaSyA3vwT5sqlnynxZBgWsU_sIECqjbz3BpUo",
  authDomain: "zenos-ac6b2.firebaseapp.com",
  projectId: "zenos-ac6b2",
  storageBucket: "zenos-ac6b2.firebasestorage.app",
  messagingSenderId: "411148782192",
  appId: "1:411148782192:web:e70d6c634ca1c86c6102b5",
  measurementId: "G-EDEHGJFQHH"
};

// Projeto deliberadamente fictício/demo. Mesmo que os emuladores estejam desligados,
// localhost nunca recebe a configuração do Firebase de produção.
const homologationFirebaseConfig = {
  apiKey: "demo-api-key",
  authDomain: "demo-zenos-local.firebaseapp.com",
  projectId: "demo-zenos-local",
  storageBucket: "demo-zenos-local.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:zenoslocal"
};

const firebaseConfig = ZENOS_RUNTIME.isHomologacao
  ? homologationFirebaseConfig
  : productionFirebaseConfig;

const app = initializeApp(firebaseConfig);

// Recovery is explicit, isolated to the browser tab, and never deletes the
// original Auth/Firestore IndexedDB or protected PDV drafts. This avoids a
// damaged browser-persistent Firebase store when incognito still works.
const safeSessionRequested = (() => {
  if (typeof window === 'undefined') return false;
  try {
    const requested = new URLSearchParams(window.location.search).get('zenos_safe_session') === '1';
    if (requested) window.sessionStorage.setItem('zenos_safe_session', '1');
    return requested || window.sessionStorage.getItem('zenos_safe_session') === '1';
  } catch {
    return false;
  }
})();
export const ZENOS_SAFE_SESSION = safeSessionRequested && ZENOS_RUNTIME.isProduction;
export const auth = ZENOS_SAFE_SESSION
  ? initializeAuth(app, { persistence: browserSessionPersistence })
  : getAuth(app);

// The normal mode retains existing persistent multi-tab Firestore cache.
// In explicitly chosen recovery mode use memory-only cache, to avoid opening
// broken IndexedDB. Server confirmation and write guards are unchanged.
export const db = initializeFirestore(app, {
  localCache: ZENOS_SAFE_SESSION
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (ZENOS_RUNTIME.isHomologacao) {
  connectAuthEmulator(
    auth,
    `http://${ZENOS_RUNTIME.authEmulatorHost}:${ZENOS_RUNTIME.authEmulatorPort}`,
    { disableWarnings: true }
  );
  connectFirestoreEmulator(
    db,
    ZENOS_RUNTIME.firestoreEmulatorHost,
    ZENOS_RUNTIME.firestoreEmulatorPort
  );
  connectFunctionsEmulator(getFunctions(app, 'southamerica-east1'), ZENOS_RUNTIME.firestoreEmulatorHost, 5001);
  console.info(
    `[ZenOS] HOMOLOGAÇÃO ATIVA — projeto ${ZENOS_RUNTIME.firebaseProjectId} — ` +
    `Auth ${ZENOS_RUNTIME.authEmulatorHost}:${ZENOS_RUNTIME.authEmulatorPort} — ` +
    `Firestore ${ZENOS_RUNTIME.firestoreEmulatorHost}:${ZENOS_RUNTIME.firestoreEmulatorPort}`
  );
} else {
  try {
    getAnalytics(app);
  } catch (error) {
    console.warn('[ZenOS Analytics] Analytics indisponível neste navegador:', error);
  }
}

export { ZENOS_RUNTIME };
