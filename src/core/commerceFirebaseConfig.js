import {getApps} from 'firebase/app';
import {ZENOS_RUNTIME} from './runtimeEnvironment';
// SDK público específico do projeto de teste. Não inicializa o Firebase operacional.
const raw=import.meta.env.VITE_ZENOS_COMMERCE_HML_FIREBASE_CONFIG;
let configured=null;
if(raw){
 configured=JSON.parse(raw);
 if(configured.projectId!=='zenos-commerce-homologacao'||configured.storageBucket!=='zenos-commerce-homologacao.firebasestorage.app'||!configured.apiKey||!configured.appId)
  throw new Error('Configuração Commerce de homologação inválida.');
}
export function obterOpcoesFirebaseCommerce(){
 if(configured)return configured;
 if(ZENOS_RUNTIME.isHomologacao)return {apiKey:'demo-api-key',authDomain:'demo-zenos-local.firebaseapp.com',projectId:'demo-zenos-local',storageBucket:'demo-zenos-local.appspot.com',appId:'1:000000000000:web:zenoslocal'};
 const existing=getApps().find(app=>app.name==='[DEFAULT]');
 if(existing)return existing.options;
 throw new Error('Configure o Firebase Commerce de homologação antes de abrir esta página.');
}
export const commerceEmulado=!configured&&ZENOS_RUNTIME.isHomologacao;

export const commerceProjetoHomologacao=Boolean(configured)||ZENOS_RUNTIME.isHomologacao;
