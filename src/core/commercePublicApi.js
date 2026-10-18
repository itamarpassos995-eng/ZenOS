import {initializeApp,getApps} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInAnonymously,browserSessionPersistence,setPersistence} from 'firebase/auth';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {ZENOS_RUNTIME} from './runtimeEnvironment';
import {obterOpcoesFirebaseCommerce,commerceEmulado} from './commerceFirebaseConfig';
import {comPrazoCommerce} from './commerceCheckout';
let app;
function publicoApp(){
 if(app)return app;
 app=getApps().find(x=>x.name==='zenos-commerce-publico')||initializeApp(obterOpcoesFirebaseCommerce(),'zenos-commerce-publico');
 if(commerceEmulado){connectAuthEmulator(getAuth(app),`http://${ZENOS_RUNTIME.authEmulatorHost}:${ZENOS_RUNTIME.authEmulatorPort}`,{disableWarnings:true});connectFunctionsEmulator(getFunctions(app,'southamerica-east1'),ZENOS_RUNTIME.firestoreEmulatorHost,5001);}
 return app;
}
export function chamarLojaCommerce(data){return comPrazoCommerce(async()=>{
 const app=publicoApp();
 if(['criarPedido','consultarPedido'].includes(data.action)){
  const auth=getAuth(app);await auth.authStateReady();
  if(!auth.currentUser&&data.action==='consultarPedido')throw new Error('A sessão deste envio não está disponível. Consulte a loja antes de iniciar outro pedido.');
  if(!auth.currentUser){await setPersistence(auth,browserSessionPersistence);await signInAnonymously(auth);}
 }
 return (await httpsCallable(getFunctions(app,'southamerica-east1'),'commerceLoja',{timeout:25000})(data)).data;
});}
