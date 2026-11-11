import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PROJECT,commerceProductionPrecondition,commerceTenantEntitlement,assertCommerceProductionAllowed} from '../src/commerceProductionPolicyCore.js';
const production={GCLOUD_PROJECT:PROJECT,ZENOS_COMMERCE_PRODUCTION_RELEASE:'enabled'};
const lojaId='loja-ficticia-a';
const license={lojaId,modulo:'commerce',status:'ativo',ativacaoConfirmadaServidor:true,bloqueado:false};
const activation={lojaId,estado:'ativo',versao:1,aprovacaoProprietario:true};
test('bloqueio global default OFF sem qualquer gravação',()=>{
 assert.deepEqual(commerceProductionPrecondition({GCLOUD_PROJECT:PROJECT}),{ready:false,reason:'PRODUCTION_KILL_SWITCH_OFF'});
 for(const project of [undefined,'zenos-commerce-homologacao','demo-zenos-local','zenos-invalid']) {
   assert.equal(commerceProductionPrecondition({GCLOUD_PROJECT:project,ZENOS_COMMERCE_PRODUCTION_RELEASE:'enabled'}).ready,false);
 }
 for(const env of [
  {...production,ZENOS_COMMERCE_HOMOLOGACAO:'true'},
  {...production,VITE_ZENOS_COMMERCE_HML_FIREBASE_CONFIG:'{"projectId":"zenos-commerce-homologacao"}'},
  {...production,ZENOS_COMMERCE_STORAGE_BUCKET:'zenos-commerce-homologacao.firebasestorage.app'}
 ])assert.equal(commerceProductionPrecondition(env).ready,false);
 assert.equal(commerceProductionPrecondition(production).ready,true);
});
test('licença e ativação precisam pertencer exatamente à loja, ambas originadas do servidor',()=>{
 assert.equal(commerceTenantEntitlement({lojaId,licenca:license,ativacao:activation}).ready,false);
 assert.equal(commerceTenantEntitlement({lojaId,licenca:license,ativacao:activation,globalReady:true}).ready,true);
 const invalidLicense=[
  null,{...license,lojaId:'outra-loja'},{...license,modulo:'fiscal'},
  {...license,status:'solicitado'},{...license,status:'suspenso'},
  {...license,bloqueado:true},{...license,ativacaoConfirmadaServidor:false},
  {...license,homologacao:true}
 ];
 for(const licenca of invalidLicense)assert.equal(commerceTenantEntitlement({lojaId,licenca,ativacao:activation,globalReady:true}).ready,false);
 const invalidActivation=[
  undefined,{...activation,lojaId:'outra-loja'},{...activation,estado:'inativo'},
  {...activation,aprovacaoProprietario:false},{...activation,versao:2},{...activation,homologacao:true}
 ];
 for(const ativacao of invalidActivation)assert.equal(commerceTenantEntitlement({lojaId,licenca:license,ativacao,globalReady:true}).ready,false);
 assert.equal(commerceTenantEntitlement({lojaId:'../outra-loja',licenca:license,ativacao:activation,globalReady:true}).ready,false);
});
test('API exige autorização dupla e falha fechada',()=>{
 assert.throws(()=>assertCommerceProductionAllowed({}, {lojaId,licenca:license,ativacao:activation}),/COMMERCE_PRODUCTION_DENIED/);
 assert.throws(()=>assertCommerceProductionAllowed(production,{lojaId,licenca:{...license,status:'solicitado'},ativacao:activation}),/COMMERCE_TENANT_DENIED/);
 assert.deepEqual(assertCommerceProductionAllowed(production,{lojaId,licenca:license,ativacao:activation}),{lojaId});
});
