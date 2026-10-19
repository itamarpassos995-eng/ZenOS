import {initializeApp,getApps} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInAnonymously,inMemoryPersistence,setPersistence,signOut} from 'firebase/auth';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {ZENOS_RUNTIME} from './runtimeEnvironment';
import {obterOpcoesFirebaseCommerce,commerceEmulado} from './commerceFirebaseConfig';
import {comPrazoCommerce} from './commerceCheckout';
let app,checkoutAuthReady=null;
function publicoApp(){
 if(app)return app;
 app=getApps().find(x=>x.name==='zenos-commerce-publico')||initializeApp(obterOpcoesFirebaseCommerce(),'zenos-commerce-publico');
 if(commerceEmulado){connectAuthEmulator(getAuth(app),`http://${ZENOS_RUNTIME.authEmulatorHost}:${ZENOS_RUNTIME.authEmulatorPort}`,{disableWarnings:true});connectFunctionsEmulator(getFunctions(app,'southamerica-east1'),ZENOS_RUNTIME.firestoreEmulatorHost,5001);}
 return app;
}
export function chamarLojaCommerce(data){return comPrazoCommerce(async()=>{
 const app=publicoApp();
 if(['criarPedido','consultarPedido'].includes(data.action)){
  const auth=getAuth(app);
  if(!checkoutAuthReady){
   checkoutAuthReady=(async()=>{
    await auth.authStateReady();
    // Versões anteriores persistiam a identidade anônima no navegador.
    // A nova sessão é exclusiva desta página, sem armazenamento durável.
    const identidadeAnterior=auth.currentUser;
    await setPersistence(auth,inMemoryPersistence);
    if(identidadeAnterior)await signOut(auth);
    await signInAnonymously(auth);
   })().catch(e=>{checkoutAuthReady=null;throw e;});
  }
  await checkoutAuthReady;
 }
 return (await httpsCallable(getFunctions(app,'southamerica-east1'),'commerceLoja',{timeout:25000})(data)).data;
});}
