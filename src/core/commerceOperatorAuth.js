import {initializeApp,getApps} from 'firebase/app';
import {getAuth,initializeAuth,inMemoryPersistence,connectAuthEmulator,GoogleAuthProvider,signInWithPopup,browserPopupRedirectResolver} from 'firebase/auth';
import {getFunctions,connectFunctionsEmulator} from 'firebase/functions';
import {auth,ZENOS_RUNTIME} from '../firebase';

// Sessão exclusiva do Commerce: nunca substitui o login compartilhado do ZenOS.
export function obterSessaoOperadorCommerce(){
 const name='zenos-commerce-operador';
 let app=getApps().find(item=>item.name===name);
 if(!app){
  app=initializeApp(auth.app.options,name);
  initializeAuth(app,{persistence:inMemoryPersistence,popupRedirectResolver:browserPopupRedirectResolver});
  if(ZENOS_RUNTIME.isHomologacao){
   connectAuthEmulator(getAuth(app),`http://${ZENOS_RUNTIME.authEmulatorHost}:${ZENOS_RUNTIME.authEmulatorPort}`,{disableWarnings:true});
   connectFunctionsEmulator(getFunctions(app,'southamerica-east1'),ZENOS_RUNTIME.firestoreEmulatorHost,5001);
  }
 }
 return getAuth(app);
}
export function entrarOperadorCommerce(){
 const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
 return signInWithPopup(obterSessaoOperadorCommerce(),provider);
}
