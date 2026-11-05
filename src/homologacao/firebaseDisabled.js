// Static homologation only. No Firebase app, auth, analytics or transport.
export const db = null;
export const auth = null;
export const ZENOS_RUNTIME = Object.freeze({ isHomologacao:true, isProduction:false, environment:'HOMOLOGACAO', firebaseProjectId:'disabled-static-money-test', storageNamespace:'zenos_money_test__' });
export const runtimeStorageKey = key => 'zenos_money_test__' + String(key);
