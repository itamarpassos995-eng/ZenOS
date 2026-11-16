import {test,expect,vi,beforeEach} from 'vitest';
const mock=vi.hoisted(()=>({route:null,reroutes:0,v2Commits:[],serverMode:'v2'}));
vi.mock('firebase/firestore',async original=>({
  ...(await original()),
  doc:(_db,...path)=>path.join('/'),
  getDocFromServer:async()=>({exists:()=>true,data:()=>({mode:mock.serverMode})}),
  runTransaction:async (_db,handler)=>handler({
    get:async path=>{
      if(path==='lojas/vipe/dados/storage_control')return {exists:()=>true,data:()=>({mode:'v2'})};
      throw new Error('V1 must reject changed route before touching sale state: '+path);
    },
  }),
}));
vi.mock('../../src/core/operationalRepository.js',()=>({
  getOperationalWriteSession:async()=>mock.route,
  clearOperationalSession:()=>{mock.reroutes++;mock.route=mock.serverMode==='v2'?{control:{mode:'v2'},failed:null}:null;},
}));
vi.mock('../../src/core/operationalV2.js',()=>({
  persistV2BusinessOperationSafe:async command=>{
    mock.v2Commits.push(command);
    return {ok:true,cloudOk:true,values:{historicoVendas:command.changes[0].value},revisions:{}};
  },
}));
import {persistV1BusinessOperationSafe} from '../../src/core/productionSync.js';

beforeEach(()=>{mock.route=null;mock.reroutes=0;mock.v2Commits.length=0;mock.serverMode='v2';});

test('VIPE: V1 guard rejects changed route; retry V2 with same sale, stock, payment and idempotency key',async()=>{
 const sale={id:'VENDA-VIPE-ORIGINAL',itens:[{id:'I',qtd:1}]};
 const command={
  db:{},userId:'vipe',
  changes:[{field:'historicoVendas',baseValue:[],value:[sale]}],
  financialEntries:[{id:'PG-VIPE',valor:10}],
  stockEvents:[{id:'ST-VIPE',produtoId:'sku'}],
  guards:[{type:'cash_session_open',sessionId:'CAIXA'}],
  operationKey:'pdv:VENDA-VIPE-ORIGINAL',
 };
 const result=await persistV1BusinessOperationSafe(command);
 expect(result.cloudOk).toBe(true);
 expect(mock.reroutes).toBe(1);
 expect(mock.v2Commits).toHaveLength(1);
 expect(mock.v2Commits[0].operationKey).toBe(command.operationKey);
 expect(mock.v2Commits[0].changes).toEqual(command.changes);
 expect(mock.v2Commits[0].financialEntries).toEqual(command.financialEntries);
 expect(mock.v2Commits[0].stockEvents).toEqual(command.stockEvents);
 expect(mock.v2Commits[0].guards).toEqual(command.guards);
});

test('VIPE: conflicting authoritative route does not fall back to legacy or retry payment',async()=>{
 mock.serverMode='maintenance';
 const result=await persistV1BusinessOperationSafe({db:{},userId:'vipe',changes:[{field:'historicoVendas',baseValue:[],value:[{id:'SALE-PENDING'}]}],operationKey:'pdv:SALE-PENDING'});
 expect(result.cloudOk).toBe(false);
 expect(result.error.code).toBe('ZENOS_STORAGE_ROUTE_MISMATCH');
 expect(result.error.routeMode).toBe('maintenance');
 expect(mock.reroutes).toBe(0);
 expect(mock.v2Commits).toHaveLength(0);
});

test('VIPE: authoritative legacy route triggers only one guarded retry, no write loop',async()=>{
 mock.serverMode='legacy';
 const pending={id:'VENDA-VIPE-PENDENTE'};
 const result=await persistV1BusinessOperationSafe({
  db:{},userId:'vipe',
  changes:[{field:'historicoVendas',baseValue:[],value:[pending]}],
  operationKey:'pdv:VENDA-VIPE-PENDENTE',
 });
 expect(result.cloudOk).toBe(false);
 expect(result.error.code).toBe('ZENOS_STORAGE_ROUTE_MISMATCH');
 expect(result.error.routeMode).toBe('legacy');
 expect(result.error.recoveryAttempts).toBe(1);
 expect(mock.reroutes).toBe(1);
 expect(mock.v2Commits).toHaveLength(0);
});
