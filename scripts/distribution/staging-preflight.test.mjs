import assert from 'node:assert/strict';
import test from 'node:test';
import {validateStagingPreorderDraft,stagingPreorderErrorMessage} from '../../src/core/distribution/stagingPreorderValidation.js';
const key='pdv:PRÉ-PEDIDO-1794440000000-abc123';
function fixture(){
 const p={id:'P1',sku:'PY-001',nome:'Papel de prueba',estoqueGalpao:30,estoqueReservadoDistribuicao:0,
  valoresMonetarios:{versao:1,campos:{precoVenda:{valor:39990,moeda:'PYG'}}}};
 const catalog={products:[p],customers:[{id:'C1',nome:'Cliente de prueba'}],rates:{BRL:1,PYG:1333}};
 const order={id:key.slice(4),tipoDocumento:'pre_pedido',estado:'pendente',clienteId:'C1',moedaDocumento:'PYG',
  totalOriginal:39990,pagamentos:[],itens:[{produtoOriginalId:'P1',qtd:'1'}]};
 const request={operationKey:key,changes:[{field:'historicoVendas',value:[order]}],financialEntries:[],stockEvents:[]};
 return {catalog,request,order,p};
}
const check=(mutate,expected)=>{const data=fixture();mutate(data);assert.equal(validateStagingPreorderDraft(data.request,data.catalog).code,expected)};
test('PYG staging preorder has a pure valid preflight, exact snapshot and no mutation',()=>{
 const data=fixture(),before=JSON.stringify(data);
 const result=validateStagingPreorderDraft(data.request,data.catalog);
 assert.deepEqual(result,{ok:true,payload:{type:'create',key,customerId:'C1',lines:[{productId:'P1',quantity:1}],totalOriginal:39990,pygRate:1333}});
 assert.equal(JSON.stringify(data),before);
});
test('refuses missing or arbitrary customer',()=>{
 check(d=>{d.order.clienteId=null},'CUSTOMER_REQUIRED');
 check(d=>{d.order.clienteId='C999'},'CUSTOMER_REQUIRED');
});
test('refuses payment, stock writes, unexpected changes or sale finalization',()=>{
 check(d=>{d.order.pagamentos=[{formaId:'dinheiro'}]},'INVALID_PREORDER_SNAPSHOT');
 check(d=>{d.request.stockEvents=[{}]},'INVALID_PREORDER_SNAPSHOT');
 check(d=>{d.request.financialEntries=[{}]},'INVALID_PREORDER_SNAPSHOT');
 check(d=>{d.request.changes.push({field:'produtos',value:[]})},'INVALID_PREORDER_SNAPSHOT');
 check(d=>{d.order.tipoDocumento='venda'},'INVALID_PREORDER_SNAPSHOT');
 check(d=>{d.order.moedaDocumento='BRL'},'INVALID_PREORDER_SNAPSHOT');
});
test('refuses missing, malformed and duplicated product items',()=>{
 check(d=>{d.order.itens=[]},'INVALID_COMMAND');
 check(d=>{d.order.itens[0].produtoOriginalId='P999'},'PRODUCT_NOT_FOUND');
 check(d=>{d.order.itens[0].qtd=0},'INVALID_QUANTITY');
 check(d=>{d.order.itens[0].qtd=1.5},'INVALID_QUANTITY');
 check(d=>{d.order.itens[0].qtd=1000},'INVALID_QUANTITY');
 check(d=>{d.order.itens.push({...d.order.itens[0]})},'DUPLICATE_LINE');
 check(d=>{d.p.tipoItem='servico'},'PRODUCT_NOT_FOUND');
});
test('refuses insufficient warehouse balance and currency drift',()=>{
 check(d=>{d.p.estoqueReservadoDistribuicao=30},'INSUFFICIENT_STOCK');
 check(d=>{d.p.valoresMonetarios.campos.precoVenda.moeda='BRL'},'PRODUCT_NOT_FOUND');
 check(d=>{d.p.valoresMonetarios.campos.precoVenda.valor=39991},'ORDER_SNAPSHOT_CHANGED');
 check(d=>{d.order.totalOriginal=0},'ORDER_SNAPSHOT_CHANGED');
 check(d=>{d.catalog.rates.PYG=0},'PAYMENT_RATE_REQUIRED');
});
test('rejects invalid idempotency key and provides localized safe errors',()=>{
 check(d=>{d.request.operationKey='pdv:bad'},'INVALID_COMMAND');
 assert.match(stagingPreorderErrorMessage('CUSTOMER_REQUIRED'),/cliente cadastrado/);
 assert.match(stagingPreorderErrorMessage('ORDER_SNAPSHOT_CHANGED'),/preço/);
 assert.match(stagingPreorderErrorMessage('SOME_NEW_CODE'),/não confirmado/);
});
