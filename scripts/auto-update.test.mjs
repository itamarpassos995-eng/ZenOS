import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutoUpdateController} from '../src/core/autoUpdate.js';
import handler, {resolveBuildVersion} from '../api/version.js';

const A='a'.repeat(40), B='b'.repeat(40);
const harness=({safe=true,online=true,visible=true,focused=false,remote=B,version=A}={})=>{
  let t=100_000, reloads=0;
  const doc={visibilityState:visible?'visible':'hidden',activeElement:{matches:()=>focused}};
  const win={navigator:{onLine:online},location:{reload:()=>reloads++}};
  const ctrl=createAutoUpdateController({
    currentVersion:version,win,doc,now:()=>t,isSafe:()=>safe,
    fetcher:async()=>({ok:true,json:async()=>({version:remote})}),
  });
  return {ctrl,win,doc,clock:ms=>{t+=ms},setSafe:x=>{safe=x},setFocused:x=>{focused=x},setRemote:x=>{remote=x},reloads:()=>reloads};
};
test('endpoint GET no-store sem Firebase',()=>{
  const headers={};const res={setHeader:(k,v)=>{headers[k]=v;return res},status:n=>{res.code=n;return res},json:x=>{res.body=x;return res}};
  const previous=process.env.VERCEL_GIT_COMMIT_SHA;process.env.VERCEL_GIT_COMMIT_SHA=A;
  try{handler({method:'GET'},res);assert.equal(res.code,200);assert.equal(res.body.version,A);assert.match(headers['Cache-Control'],/no-store/)}finally{if(previous===undefined)delete process.env.VERCEL_GIT_COMMIT_SHA;else process.env.VERCEL_GIT_COMMIT_SHA=previous}
  assert.equal(resolveBuildVersion({VERCEL_GIT_COMMIT_SHA:'bad'}),null);
});
test('nunca recarrega durante operação ativa',async()=>{
 const h=harness({safe:false});await h.ctrl.poll();h.clock(1_000_000);assert.equal(h.ctrl.evaluate(),false);assert.equal(h.reloads(),0);
});
test('espera janela segura contínua de 90 segundos',async()=>{
 const h=harness();await h.ctrl.poll();h.clock(89_999);h.ctrl.evaluate();assert.equal(h.reloads(),0);
 h.clock(1);assert.equal(h.ctrl.evaluate(),true);assert.equal(h.reloads(),1);
});
test('operação pendente interrompe janela segura',async()=>{
 const h=harness();await h.ctrl.poll();h.clock(80_000);h.setSafe(false);h.ctrl.evaluate();h.setSafe(true);
 h.clock(20_000);h.ctrl.evaluate();assert.equal(h.reloads(),0);
 h.clock(90_000);h.ctrl.evaluate();assert.equal(h.reloads(),1);
});
test('não atualiza com aba oculta, offline ou campo em edição',async()=>{
 const h=harness({visible:false});await h.ctrl.poll();assert.equal(h.ctrl.getPendingVersion(),null);
 h.doc.visibilityState='visible';await h.ctrl.poll();h.clock(200_000);h.doc.visibilityState='hidden';h.ctrl.evaluate();assert.equal(h.reloads(),0);
 h.doc.visibilityState='visible';h.win.navigator.onLine=false;h.ctrl.evaluate();assert.equal(h.reloads(),0);
 h.win.navigator.onLine=true;h.setFocused(true);h.ctrl.evaluate();assert.equal(h.reloads(),0);
});
test('versão igual, versão inválida e build local não recarregam',async()=>{
 const same=harness({remote:A});await same.ctrl.poll();same.clock(200_000);same.ctrl.evaluate();assert.equal(same.reloads(),0);
 const local=harness({version:'local'});await local.ctrl.poll();assert.equal(local.ctrl.getPendingVersion(),null);
 const invalid=harness({remote:'unknown'});await invalid.ctrl.poll();assert.equal(invalid.ctrl.getPendingVersion(),null);
});
test('nova versão detectada mas rede falha: preserva estado',async()=>{
 const h=harness();await h.ctrl.poll();h.setSafe(false);h.clock(500_000);h.ctrl.evaluate();assert.equal(h.reloads(),0);
});
