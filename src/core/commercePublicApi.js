import {initializeApp,getApps} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInAnonymously,browserSessionPersistence,setPersistence} from 'firebase/auth';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {ZENOS_RUNTIME} from './runtimeEnvironment';
import {obterOpcoesFirebaseCommerce,commerceEmulado} from './commerceFirebaseConfig';
let app;
function publicoApp(){
 if(app)return app;
 app=getApps().find(x=>x.name==='zenos-commerce-publico')||initializeApp(obterOpcoesFirebaseCommerce(),'zenos-commerce-publico');
 if(commerceEmulado){connectAuthEmulator(getAuth(app),`http://${ZENOS_RUNTIME.authEmulatorHost}:${ZENOS_RUNTIME.authEmulatorPort}`,{disableWarnings:true});connectFunctionsEmulator(getFunctions(app,'southamerica-east1'),ZENOS_RUNTIME.firestoreEmulatorHost,5001);}
 return app;
}
export async function chamarLojaCommerce(data){
 const app=publicoApp();
 if(data.action==='criarPedido'){
  const auth=getAuth(app);await auth.authStateReady();
  if(!auth.currentUser){await setPersistence(auth,browserSessionPersistence);await signInAnonymously(auth);}
 }
 return (await httpsCallable(getFunctions(app,'southamerica-east1'),'commerceLoja')(data)).data;
}
