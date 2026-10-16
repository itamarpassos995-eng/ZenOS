import {test} from 'node:test';import assert from 'node:assert/strict';
import {bootstrapCommercePermitido} from '../src/commerceHmlBootstrapCore.js';
const env={GCLOUD_PROJECT:'zenos-commerce-homologacao',ZENOS_COMMERCE_MEDIA_ENABLED:'true',ZENOS_COMMERCE_HOMOLOGACAO:'true',ZENOS_COMMERCE_STORAGE_BUCKET:'zenos-commerce-homologacao.firebasestorage.app'};
const auth={uid:'proprietario-individual',token:{email_verified:true,email:'itamarbenit@gmail.com',firebase:{sign_in_provider:'google.com'}}};
test('provisionamento fictício exige projeto isolado e proprietário Google verificado',()=>{
 assert.equal(bootstrapCommercePermitido(env,auth),true);
 for(const candidate of [null,{...auth,token:{...auth.token,email:'outra-conta@example.test'}},{...auth,token:{...auth.token,email_verified:false}},{...auth,token:{...auth.token,firebase:{sign_in_provider:'password'}}}])assert.equal(bootstrapCommercePermitido(env,candidate),false);
 for(const patch of [{GCLOUD_PROJECT:'zenos-ac6b2'},{GCLOUD_PROJECT:'demo-zenos-local'},{ZENOS_COMMERCE_HOMOLOGACAO:'false'},{ZENOS_COMMERCE_STORAGE_BUCKET:'zenos-ac6b2.firebasestorage.app'}])assert.equal(bootstrapCommercePermitido({...env,...patch},auth),false);
});
