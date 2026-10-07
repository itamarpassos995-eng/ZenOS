import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
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
export const auth = getAuth(app);
export const db = getFirestore(app);

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
