import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authorizedOperationalHml,validarPinsHml,documentosOperacionaisFicticios,operatorHmlPath} from '../src/commerceHmlOperationalCore.js';
const env={GCLOUD_PROJECT:'zenos-commerce-homologacao',
 ZENOS_COMMERCE_MEDIA_ENABLED:'true',ZENOS_COMMERCE_HOMOLOGACAO:'true',
 ZENOS_COMMERCE_STORAGE_BUCKET:'zenos-commerce-homologacao.firebasestorage.app'};
const auth={uid:'ficticio-owner-uid',token:{email_verified:true,email:'itamarbenit@gmail.com',firebase:{sign_in_provider:'google.com'}}};
test('provisionamento nega produção, outros projetos, outros operadores e contas não verificadas',()=>{
 assert.equal(authorizedOperationalHml(env,auth),true);
 assert.equal(authorizedOperationalHml({...env,GCLOUD_PROJECT:'zenos-ac6b2'},auth),false);
 assert.equal(authorizedOperationalHml({...env,ZENOS_COMMERCE_STORAGE_BUCKET:'zenos-ac6b2.firebasestorage.app'},auth),false);
 assert.equal(authorizedOperationalHml({...env,ZENOS_COMMERCE_HOMOLOGACAO:'false'},auth),false);
 assert.equal(authorizedOperationalHml(env,{...auth,uid:'outra',token:{...auth.token,email:'falso@example.com'}}),false);
 assert.equal(authorizedOperationalHml(env,{...auth,token:{...auth.token,email_verified:false}}),false);
 assert.equal(authorizedOperationalHml(env,{...auth,token:{...auth.token,firebase:{sign_in_provider:'password'}}}),false);
});
test('PINs devem ser distintos, fortes e compatíveis com autorização PBKDF2',()=>{
 for(const dupla of [['12345678','87654321'],['99999999','11223344'],['87654321','12345678'],
  ['33882211','33882211'],['1234','77776666']])assert.throws(()=>validarPinsHml(...dupla));
 assert.doesNotThrow(()=>validarPinsHml('81935247','41782963'));
 const r=documentosOperacionaisFicticios('ficticio-owner-uid','81935247','41782963');
 assert.equal(r.operacao.produtos.length,2);
 assert.equal(r.operacao.historicoVendas.length,0);
 assert.equal(r.operacao.caixaMovimentos.length,0);
 assert.equal(r.operacao.sessoesCaixa.length,0);
 assert.equal(r.operacao.vendedores.length,2);
 assert.equal(r.shop.testeSomente,true);
 assert.equal(r.shop.homologacaoProprietarioUid,'ficticio-owner-uid');
 for(const o of r.operacao.vendedores){
  assert.equal(o.pinVersion,2);assert.equal(o.pinTrocaObrigatoria,false);
  assert.match(o.pinHash,/^[a-f0-9]{64}$/);
  assert.match(o.pinSalt,/^[a-f0-9]{32}$/);
  assert.equal(o.senha,undefined);
  assert.equal(r.acessos.find(a=>a.id===o.id).data.pinHash,o.pinHash);
 }
 assert.equal(r.acessos.length,2);
 assert.notEqual(r.acessos[0].docPath,r.acessos[1].docPath);
 assert.equal(r.acessos[0].docPath,operatorHmlPath('ficticio-owner-uid','admin'));
 assert.ok(!JSON.stringify(r).includes('81935247'));
 assert.ok(!JSON.stringify(r).includes('41782963'));
});
