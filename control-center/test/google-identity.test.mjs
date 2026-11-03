import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair, SignJWT, exportJWK, createLocalJWKSet} from 'jose';
import {createGoogleIdentityVerifier, createAdminIdentityResolver} from '../src/server/google-identity.mjs';
const keys = await generateKeyPair('RS256');
const otherKeys = await generateKeyPair('RS256');
const jwks = createLocalJWKSet({keys:[{...await exportJWK(keys.publicKey), kid:'test', alg:'RS256'}]});
const nonce = 'n'.repeat(48);
const verify = createGoogleIdentityVerifier({clientId:'staging-client', jwks});
async function token(overrides = {}, key = keys.privateKey) {
  return new SignJWT({email:'owner@example.test', email_verified:true, nonce,
    sub:'123', iss:'https://accounts.google.com', aud:'staging-client',
    iat:Math.floor(Date.now()/1000), exp:Math.floor(Date.now()/1000)+300, ...overrides})
    .setProtectedHeader({alg:'RS256',kid:'test'}).sign(key);
}
test('Google: assinatura real e claims válidos produzem identidade, sem roles nem MFA', async()=>{
  assert.deepEqual(await verify(await token(),nonce), {subject:'google:123',email:'owner@example.test',issuerVerified:true});
});
for (const [name, claims] of Object.entries({issuer:{iss:'https://attacker.test'}, audience:{aud:'other'},
  nonce:{nonce:'wrong'}, expired:{exp:1}, email:{email_verified:false}, authorizedParty:{azp:'other'},
  old:{iat:Math.floor(Date.now()/1000)-3600}})) {
  test(`Google: rejeita ${name}`,async()=>assert.equal(await verify(await token(claims),nonce),null));
}
test('Google: rejeita assinatura de outra chave e token adulterado',async()=>{
  assert.equal(await verify(await token({},otherKeys.privateKey),nonce),null);
  assert.equal(await verify('fake',nonce),null);
});
test('Google: exige configuração e nonce do servidor',async()=>{
  assert.throws(()=>createGoogleIdentityVerifier(),/GOOGLE_CLIENT_ID_REQUIRED/);
  assert.equal(await verify(await token(),''),null);
});
test('Admin: usa subject parametrizado e roles do banco, ignora roles no token',async()=>{
  const resolve=createAdminIdentityResolver({pool:{async query(sql,params){
    assert.deepEqual(params,['google:123']); assert.ok(sql.includes('admin_roles'));
    return {rows:[{external_subject:'google:123',active:true,roles:['auditor']}]};
  }}});
  assert.deepEqual(await resolve({issuerVerified:true,subject:'google:123',roles:['owner']}),
    {subject:'google:123',active:true,roles:['auditor']});
});
test('Admin: nega desconhecido, inativo e identidade não verificada',async()=>{
  for(const rows of [[],[{active:false,roles:['owner']}],[{active:true,roles:[]}]]) {
    const resolve=createAdminIdentityResolver({pool:{query:async()=>({rows})}});
    assert.equal(await resolve({issuerVerified:true,subject:'google:123'}),null);
    assert.equal(await resolve({subject:'google:123'}),null);
  }
});
