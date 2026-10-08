import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasLocalSyncChange, mergeV1FieldThreeWay } from '../src/core/syncMerge.js';

let pass=0, fail=0;
const check=(name,fn)=>{try{fn();pass++;console.log(`✅ ${name}`);}catch(e){fail++;console.error(`❌ ${name}\n   ${e.message}`);}};


check('Snapshot remoto idêntico à BASE não é alteração local',()=>{
  const base=[{id:'V1',estado:'concluida'}];
  assert.equal(hasLocalSyncChange([{id:'V1',estado:'concluida'}],base),false);
  assert.equal(hasLocalSyncChange([{id:'V2',estado:'concluida'},...base],base),true);
});

check('Duas vendas concorrentes não apagam uma à outra',()=>{
  const base=[{id:'V1',estado:'concluida'}];
  const local=[{id:'V2',estado:'concluida'},...base];
  const remote=[{id:'V3',estado:'concluida'},...base];
  const out=mergeV1FieldThreeWay({field:'historicoVendas',baseValue:base,localValue:local,remoteValue:remote});
  assert.deepEqual(new Set(out.map(x=>x.id)),new Set(['V1','V2','V3']));
});

check('Conversão de pré-pedido remove somente o pré-pedido inalterado e preserva venda concorrente',()=>{
  const pre={id:'P1',estado:'pendente'};
  const base=[pre];
  const local=[{id:'V1',estado:'concluida'}];
  const remote=[{id:'V2',estado:'concluida'},pre];
  const out=mergeV1FieldThreeWay({field:'historicoVendas',baseValue:base,localValue:local,remoteValue:remote});
  assert.deepEqual(new Set(out.map(x=>x.id)),new Set(['V1','V2']));
});

check('Baixas concorrentes do mesmo estoque somam os deltas',()=>{
  const base=[{id:'1',sku:'ABC',estoque:10,estoqueVitrine:10,estoqueGalpao:0,nome:'A'}];
  const local=[{...base[0],estoque:9,estoqueVitrine:9}];
  const remote=[{...base[0],estoque:9,estoqueVitrine:9}];
  const out=mergeV1FieldThreeWay({field:'produtos',baseValue:base,localValue:local,remoteValue:remote});
  assert.equal(out[0].estoque,8);
  assert.equal(out[0].estoqueVitrine,8);
});

check('Edição remota de preço sobrevive à baixa local de estoque',()=>{
  const base=[{id:'1',sku:'ABC',estoque:10,estoqueVitrine:10,estoqueGalpao:0,precoBRL:100}];
  const local=[{...base[0],estoque:9,estoqueVitrine:9}];
  const remote=[{...base[0],precoBRL:120}];
  const out=mergeV1FieldThreeWay({field:'produtos',baseValue:base,localValue:local,remoteValue:remote});
  assert.equal(out[0].estoque,9);
  assert.equal(out[0].precoBRL,120);
});


check('Quatro vendas concorrentes preservam todas as vendas',()=>{
  const base=[{id:'V0',estado:'concluida'}];
  let remote=base;
  for(let i=1;i<=4;i++){
    const local=[{id:`V${i}`,estado:'concluida'},...base];
    remote=mergeV1FieldThreeWay({field:'historicoVendas',baseValue:base,localValue:local,remoteValue:remote});
  }
  assert.deepEqual(new Set(remote.map(x=>x.id)),new Set(['V0','V1','V2','V3','V4']));
});

check('Quatro baixas concorrentes de estoque acumulam sem perder unidade',()=>{
  const base=[{id:'P1',sku:'A',estoque:10,estoqueVitrine:10,estoqueGalpao:0,nome:'Produto'}];
  let remote=base;
  for(let i=0;i<4;i++){
    const local=[{...base[0],estoque:9,estoqueVitrine:9}];
    remote=mergeV1FieldThreeWay({field:'produtos',baseValue:base,localValue:local,remoteValue:remote});
  }
  assert.equal(remote[0].estoque,6);
  assert.equal(remote[0].estoqueVitrine,6);
});

check('Troca de SKU não duplica produto quando ID é estável',()=>{
  const base=[{id:'P1',sku:'ANTIGO',nome:'Produto',estoque:5}];
  const local=[{...base[0],sku:'NOVO'}];
  const remote=[{...base[0],precoBRL:20}];
  const out=mergeV1FieldThreeWay({field:'produtos',baseValue:base,localValue:local,remoteValue:remote});
  assert.equal(out.length,1);
  assert.equal(out[0].id,'P1');
  assert.equal(out[0].sku,'NOVO');
  assert.equal(out[0].precoBRL,20);
});

check('Fiado concorrente usa delta em vez de sobrescrever saldo',()=>{
  const base=[{id:'C1',saldoDevedorBRL:100,nome:'Cliente'}];
  const local=[{...base[0],saldoDevedorBRL:150}];
  const remote=[{...base[0],saldoDevedorBRL:130}];
  const out=mergeV1FieldThreeWay({field:'clientes',baseValue:base,localValue:local,remoteValue:remote});
  assert.equal(out[0].saldoDevedorBRL,180);
});

check('Remoção local não apaga entidade modificada por outro terminal',()=>{
  const base=[{id:'C1',nome:'Antes'}];
  const local=[];
  const remote=[{id:'C1',nome:'Alterado em outro terminal'}];
  const out=mergeV1FieldThreeWay({field:'clientes',baseValue:base,localValue:local,remoteValue:remote});
  assert.equal(out.length,1);
  assert.equal(out[0].nome,'Alterado em outro terminal');
});

const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const persistence=fs.readFileSync(new URL('../src/core/productionSync.js',import.meta.url),'utf8');

check('Snapshot remoto não usa flag temporal frágil para bloquear eco',()=>{
  assert.doesNotMatch(app,/queueMicrotask\(\(\) => \{ remotoAplicandoRef/);
  assert.doesNotMatch(app,/remotoAplicandoRef/);
  assert.doesNotMatch(app,/syncRemoteApplySkipRef/);
  assert.match(app,/const baseAtual = syncBaseRef\.current\.get\(field\)/);
  assert.match(app,/hasLocalSyncChange\(value, baseAtual\)/);
});

check('Bootstrap registra BASE antes de liberar gravações',()=>{
  assert.match(app,/registrarBaseSyncCampo\('historicoVendas'/);
  assert.match(app,/setNuvemSincronizada\(true\)/);
});

check('Realtime usa revisões por campo e ignora cache',()=>{
  assert.match(app,/fieldRevisions/);
  assert.match(app,/snap\.metadata\?\.fromCache/);
  assert.match(app,/aplicarCampoRemoto/);
});

check('Persistência serializa writes por campo e não faz retry automático',()=>{
  assert.match(app,/syncWriteQueueRef/);
  assert.match(app,/Sem retry automático/);
});

check('Persistência possui merge transacional de três vias',()=>{
  assert.match(persistence,/runTransaction/);
  assert.match(persistence,/mergeV1FieldThreeWay/);
  assert.match(persistence,/fieldRevisions/);
});

check('Circuit breaker anti-loop existe',()=>{
  assert.match(persistence,/MAX_WRITES_GLOBAL_PER_WINDOW/);
  assert.match(persistence,/ZENOS_SYNC_CIRCUIT_OPEN/);
});

check('Alteração remota/base idêntica é skip sem write',()=>{
  assert.match(persistence,/syncValuesEqual\(change\.value, change\.baseValue\)/);
  assert.match(persistence,/writesSkipped/);
});


check('Snapshot evita normalizar arrays grandes quando revisão do campo não mudou',()=>{
  assert.match(app,/revisionNum !== null && revisionVista !== undefined && revisionNum <= revisionVista/);
  assert.match(app,/const value = transform\(rawValue\)/);
});

check('Não existe timer de persistência periódica no motor de sincronização',()=>{
  assert.doesNotMatch(app,/setInterval\(/);
  assert.doesNotMatch(persistence,/setInterval\(/);
});

check('Operações críticas possuem idempotência por operationKey',()=>{
  assert.match(persistence,/recentOperationKeys/);
  assert.match(persistence,/alreadyCommitted/);
  assert.match(app,/operationKey:/);
});


check('Pré-pedido exige estado pendente e remoção protegida na transação crítica',()=>{
  const pdv=fs.readFileSync(new URL('../src/components/PDV.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(pdv,/\{(?=[^{}]*type:\s*'entity_unchanged')(?=[^{}]*entityId:\s*prePedidoEmAbertoId\b)[^{}]*\}/);
  assert.match(pdv,/if\s*\(prePedidoEmAbertoId\)\s*\{\s*guards\.push\(\{\s*type:\s*'entity_field_equals',\s*field:\s*'historicoVendas',\s*entityId:\s*prePedidoEmAbertoId,\s*entityKey:\s*'id',\s*property:\s*'estado',\s*expected:\s*'pendente',/);
  assert.match(pdv,/\{\s*field:\s*'historicoVendas',\s*value:\s*historicoProposto,\s*storageSuffix:\s*'historico_vendas',\s*removeEntityIds:\s*prePedidoEmAbertoId\s*\?\s*\[prePedidoEmAbertoId\]\s*:\s*\[\]\s*\}/);

  const helper=persistence.match(/const applyGuardedEntityRemovals = [\s\S]*?(?=\nconst assertBusinessGuards)/);
  assert.ok(helper,'Helper de remoção protegida deve existir');
  const remove=new Function('failGuard',`${helper[0]}\nreturn applyGuardedEntityRemovals;`)((message,code)=>{
    const error=new Error(message);
    error.code=code;
    throw error;
  });
  const guard={type:'entity_field_equals',field:'historicoVendas',entityId:'P1',entityKey:'id',property:'estado',expected:'pendente'};
  const merged=[{id:'P1',estado:'pendente'},{id:'P2',estado:'pendente'},{id:'V1',estado:'concluida'}];
  const args={field:'historicoVendas',mergedValue:merged,removeEntityIds:['P1'],guards:[guard]};
  assert.deepEqual(remove(args),merged.slice(1));
  assert.equal(merged.length,3);
  assert.strictEqual(remove({...args,removeEntityIds:[]}),merged);
  assert.strictEqual(remove({...args,mergedValue:null}),null);
  assert.throws(()=>remove({...args,guards:[]}),{code:'ZENOS_UNGUARDED_ENTITY_REMOVAL'});
  for(const invalid of [
    {...guard,type:'entity_unchanged'},
    {...guard,field:'produtos'},
    {...guard,entityId:'P2'},
    {...guard,property:'status'},
    {...guard,expected:'concluida'},
  ]){
    assert.throws(()=>remove({...args,guards:[invalid]}),{code:'ZENOS_UNGUARDED_ENTITY_REMOVAL'});
  }
  assert.throws(()=>remove({...args,removeEntityIds:['P1','P2']}),{code:'ZENOS_UNGUARDED_ENTITY_REMOVAL'});
  assert.deepEqual(remove({...args,removeEntityIds:['P1','P2'],guards:[guard,{...guard,entityId:'P2'}]}),[merged[2]]);
  assert.deepEqual(remove({...args,mergedValue:[{id:1},{id:2}],removeEntityIds:[1],guards:[{...guard,entityId:'1'}]}),[{id:2}]);

  const critical=persistence.slice(persistence.indexOf('export const persistV1BusinessOperationSafe ='));
  assert.match(critical,/runTransaction\(db,\s*async tx =>/);
  assert.match(critical,/assertBusinessGuards\(data,\s*guards\);[\s\S]*?for \(const change of valid\) \{\s*let mergedValue = mergeV1FieldThreeWay\([^;]*\);\s*mergedValue = applyGuardedEntityRemovals\(\{\s*field: change\.field,\s*mergedValue,\s*removeEntityIds: change\.removeEntityIds,\s*guards,\s*\}\);\s*assertMergedFieldInvariants\(/);
  const reactive=persistence.slice(persistence.indexOf('export const persistV1OperationFieldsSafe ='),persistence.indexOf('export const persistV1BusinessOperationSafe ='));
  assert.doesNotMatch(reactive,/applyGuardedEntityRemovals/);
});

check('Saídas de caixa críticas revalidam saldo dentro da transação',()=>{
  assert.match(persistence,/guard\.type === 'cash_balance_at_least'/);
  assert.match(persistence,/calcularResumoSessao/);
  assert.match(app,/type:'cash_balance_at_least'/);
  const vendas=fs.readFileSync(new URL('../src/components/Vendas.jsx',import.meta.url),'utf8');
  const despesas=fs.readFileSync(new URL('../src/components/Despesas.jsx',import.meta.url),'utf8');
  const compras=fs.readFileSync(new URL('../src/components/PDVCompras.jsx',import.meta.url),'utf8');
  assert.match(vendas,/cash_balance_at_least/);
  assert.match(despesas,/cash_balance_at_least/);
  assert.match(compras,/cash_balance_at_least/);
});

check('Falha de quota ativa cooldown e não faz retry automático',()=>{
  assert.match(persistence,/quotaBlockedUntil = Date\.now\(\) \+ QUOTA_COOLDOWN_MS/);
  assert.doesNotMatch(persistence,/setTimeout\([^\n]*persistV1/);
});

check('Documento V1 tem bloqueio preventivo antes do limite técnico',()=>{
  assert.match(persistence,/V1_DOC_HARD_BYTES/);
  assert.match(persistence,/ZENOS_V1_DOC_NEAR_LIMIT/);
});

const components = ['PDV.jsx','Vendas.jsx','PDVCompras.jsx','Produtos.jsx','Clientes.jsx','Despesas.jsx','Configuracoes.jsx'];
for (const file of components) {
  const content=fs.readFileSync(new URL(`../src/components/${file}`,import.meta.url),'utf8');
  check(`${file}: confirmação de nuvem antes do sucesso em operações críticas`,()=>{
    assert.match(content,/cloudOk|commitOperacaoNegocio|commitVendaCritica/);
  });
}

console.log(`\nATT 10.2 safety: ${pass}/${pass+fail} aprovados.`);
if(fail) process.exit(1);
