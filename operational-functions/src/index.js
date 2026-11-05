import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {provisionNativeV2} from './nativeV2.js';

initializeApp();
export const provisionNativeV2Store=onCall({region:'southamerica-east1',timeoutSeconds:30,memory:'256MiB',cpu:1,concurrency:20,maxInstances:5},async request=>{
  try {return await provisionNativeV2(getFirestore(),request);}
  catch(error){
    if(['unauthenticated','invalid-argument','failed-precondition'].includes(error.code)) throw new HttpsError(error.code,error.message);
    // Do not leak SDK credentials, document contents or infrastructure errors.
    throw new HttpsError('unavailable','Não foi possível confirmar a criação do armazenamento. Tente novamente.');
  }
});
