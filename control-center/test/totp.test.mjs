import test from 'node:test';
import assert from 'node:assert/strict';
import {matchTotp,createTotpSecondFactor} from '../src/server/totp.mjs';
const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
test('TOTP: vetores RFC 6238 reduzidos a seis dígitos',()=>{
  for(const [seconds,code] of [[59,'287082'],[1111111109,'081804'],[1111111111,'050471'],[1234567890,'005924'],[2000000000,'279037'],[20000000000,'353130']])
    assert.equal(matchTotp({secret,code,now:seconds*1000}),Math.floor(seconds/30));
});
test('TOTP: rejeita inválido e fora da janela',()=>{
  for(const code of ['123','abcdef',123456,'2870820'])assert.equal(matchTotp({secret,code}),null);
  assert.equal(matchTotp({secret,code:'287082',now:180000}),null);
});
test('TOTP: reserva contador no banco e rejeita replay',async()=>{
  let last=-1;const calls=[];
  const client={async query(sql,params){calls.push(sql);if(sql.startsWith('SELECT'))return {rows:[{admin_id:'id',last_counter:last,failures:0}]};
    if(sql.includes('SET last_counter'))last=params[1];return {rows:[]};},release(){}};
  const verify=createTotpSecondFactor({pool:{connect:async()=>client},loadSecret:async()=>secret,now:()=>59000});
  assert.equal(await verify({subject:'google:123',code:'287082'}),true);
  assert.equal(await verify({subject:'google:123',code:'287082'}),false);
  assert.ok(calls.some(sql=>sql.includes('FOR UPDATE')));
});
test('TOTP: bloqueado não carrega segredo e falha de banco nega acesso',async()=>{
  const verify=createTotpSecondFactor({pool:{connect:async()=>({query:async()=>({rows:[{locked_until:new Date(999999)}]}),release(){}})},loadSecret:async()=>{throw Error('must not load')},now:()=>59000});
  assert.equal(await verify({subject:'google:123',code:'287082'}),false);
});
