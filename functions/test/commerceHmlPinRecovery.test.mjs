import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import {autenticacaoRecenteHml,prepararRedefinicaoPinsHml} from '../src/commerceHmlPinRecoveryCore.js';
import {documentosOperacionaisFicticios} from '../src/commerceHmlOperationalCore.js';
const uid='owner-ficticio';
const credAntigas=['81935247','41782963'];
const novas=['73518249','92473518'];
const sample=()=>documentosOperacionaisFicticios(uid,...credAntigas);
function args(seed=sample()){
 return {uid,loja:seed.shop,operacao:seed.operacao,acessos:seed.acessos.map(a=>a.data),
  pinAdmin:novas[0],pinSegundo:novas[1]};
}
const matches=(pin,cred)=>pbkdf2Sync(pin,Buffer.from(cred.pinSalt,'hex'),120000,32,'sha256').toString('hex')===cred.pinHash;
test('Google precisa confirmar autenticação nova e não aceita relógios inválidos',()=>{
 const now=1760850000000;
 assert.equal(autenticacaoRecenteHml({token:{auth_time:Math.floor(now/1000)-5}},now),true);
 assert.equal(autenticacaoRecenteHml({token:{auth_time:Math.floor(now/1000)-301}},now),false);
 assert.equal(autenticacaoRecenteHml({token:{auth_time:Math.floor(now/1000)+5}},now),false);
 assert.equal(autenticacaoRecenteHml({token:{}},now),false);
 assert.equal(autenticacaoRecenteHml({},now),false);
});
test('novas credenciais preservam todos os campos de caixa/produtos/vendas e geram hash PBKDF2',()=>{
 const seed=sample();
 seed.operacao.produtos[0].estoque=12;
 seed.operacao.historicoVendas=[{id:'venda-ficticia',totalBRL:20,estado:'concluida'}];
 seed.operacao.caixaMovimentos=[{id:'movimento-ficticio',valor:20}];
 const original=JSON.parse(JSON.stringify(seed.operacao));
 const r=prepararRedefinicaoPinsHml(args(seed));
 assert.deepEqual(seed.operacao,original,'função pura não pode alterar a operação original');
 assert.equal(r.vendedores.length,2);assert.equal(r.privado.length,2);
 for(let i=0;i<2;i++){
  const nova=r.vendedores.find(v=>v.id===seed.operacao.vendedores[i].id);
  assert.equal(matches(novas[i],nova),true);
  assert.equal(matches(credAntigas[i],nova),false);
  assert.equal(nova.senha,null);
  assert.equal(nova.pinVersion,2);
  assert.equal(nova.nome,seed.operacao.vendedores[i].nome);
  assert.equal(r.privado[i].pinHash,nova.pinHash);
  assert.equal(r.privado[i].versao,2);
 }
 assert.notEqual(r.vendedores[0].pinSalt,r.vendedores[1].pinSalt);
 assert.ok(!JSON.stringify(r).includes(novas[0]));
 assert.ok(!JSON.stringify(r).includes(novas[1]));
});
test('sem proprietário/loja de testes/acessos equivalentes não há redefinição',()=>{
 const base=sample();
 for(const wrong of [
  {...args(base),uid:'outra-loja'},
  {...args(base),loja:{...base.shop,tipo:'producao'}},
  {...args(base),loja:{...base.shop,testeSomente:false}},
  {...args(base),operacao:{...base.operacao,vendedores:[...base.operacao.vendedores,{id:'novo',nome:'A'}]}},
  {...args(base),acessos:[{...base.acessos[0].data,pinHash:'forjado'},base.acessos[1].data]},
  {...args(base),acessos:[{...base.acessos[0].data,versao:0},base.acessos[1].data]},
  {...args(base),pinAdmin:novas[0],pinSegundo:novas[0]},
  {...args(base),pinAdmin:'12345678'}
 ])assert.throws(()=>prepararRedefinicaoPinsHml(wrong));
});
test('callable só altera vendedores e ambos os ACLs na mesma transação do Firebase',async()=>{
 const {readFileSync}=await import('node:fs');
 const src=readFileSync(new URL('../src/commerceHmlOperationalSeed.js',import.meta.url),'utf8');
 assert.match(src,/authorizedOperationalHml\(process\.env,request\.auth\)/);
 assert.match(src,/autenticacaoRecenteHml\(request\.auth\)/);
 assert.match(src,/db\.runTransaction\(async tx=>/);
 assert.match(src,/tx\.update\(op,\{vendedores:dados\.vendedores\}\)/);
 assert.match(src,/tx\.update\(acl\[0\],dados\.privado\[0\]\)/);
 assert.match(src,/tx\.update\(acl\[1\],dados\.privado\[1\]\)/);
});
