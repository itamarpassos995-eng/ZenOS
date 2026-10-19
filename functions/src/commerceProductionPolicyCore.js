/**
 * Production-only Commerce guard. Pure, fail-closed, NO Firestore writes.
 * Caller must read settings with Admin SDK from the tenant path, never from request body.
 * This module does not deploy a service or enable any customer.
 */
export const PROJECT='zenos-ac6b2';
const HML='zenos-commerce-homologacao';
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9._:-]{1,120}$/.test(v)&&!['.','..','__proto__'].includes(v);
const forbidden=v=>/^(?:true|1|yes)$/i.test(String(v||''));
export function commerceProductionPrecondition(env={}) {
 const project=env.GCLOUD_PROJECT||env.GCP_PROJECT||env.FIREBASE_CONFIG_PROJECT_ID;
 if(project!==PROJECT)return {ready:false,reason:'FIREBASE_PROJECT_NOT_PRODUCTION'};
 if(forbidden(env.ZENOS_COMMERCE_HOMOLOGACAO)||env.VITE_ZENOS_COMMERCE_HML_FIREBASE_CONFIG
   ||env.ZENOS_COMMERCE_STORAGE_BUCKET?.includes(HML))return {ready:false,reason:'HOMOLOGATION_CONFIGURATION_FORBIDDEN'};
 // Product-wide remote kill switch, false until tested and authorized.
 if(env.ZENOS_COMMERCE_PRODUCTION_RELEASE!=='enabled')return {ready:false,reason:'PRODUCTION_KILL_SWITCH_OFF'};
 return {ready:true,reason:'PROJECT_AND_GLOBAL_RELEASE_CONFIRMED'};
}
export function commerceTenantEntitlement({lojaId,licenca,ativacao,globalReady=false}={}) {
 if(globalReady!==true||!validId(lojaId))return {ready:false,reason:'GATE_OFF'};
 // License and activation MUST be server-owned private documents below the SAME store.
 // Customer-supplied token/body/flags cannot substitute for Admin SDK reads.
 if(licenca?.lojaId!==lojaId||licenca?.modulo!=='commerce'||licenca?.status!=='ativo'
   ||licenca?.ativacaoConfirmadaServidor!==true||licenca?.bloqueado===true||licenca?.homologacao===true)
   return {ready:false,reason:'SERVER_LICENSE_REQUIRED'};
 if(ativacao?.lojaId!==lojaId||ativacao?.estado!=='ativo'
   ||ativacao?.versao!==1||ativacao?.aprovacaoProprietario!==true||ativacao?.homologacao===true)
   return {ready:false,reason:'OWNER_ACTIVATION_REQUIRED'};
 return {ready:true,reason:'AUTHORIZED_TENANT'};
}
export function assertCommerceProductionAllowed(env,tenant) {
 const global=commerceProductionPrecondition(env);
 if(!global.ready)throw new Error('COMMERCE_PRODUCTION_DENIED:'+global.reason);
 const loja=commerceTenantEntitlement({...tenant,globalReady:true});
 if(!loja.ready)throw new Error('COMMERCE_TENANT_DENIED:'+loja.reason);
 return {lojaId:tenant.lojaId};
}
