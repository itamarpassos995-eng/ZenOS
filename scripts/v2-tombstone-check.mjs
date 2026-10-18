import assert from 'node:assert/strict';
import { reconciliarExclusoesV2 } from '../src/core/v2TombstoneReconciliation.js';
import { mergeV1FieldThreeWay } from '../src/core/syncMerge.js';
import { encodeV2Id } from '../src/core/operationalV2Schema.js';

const original={id:'PRE-ANTIGO',estado:'pendente',itens:[{id:'line-1',qtd:1}]};
const outraVenda={id:'VENDA-RECENTE',estado:'concluida',totalBRL:25,itens:[]};
const base=[original], remoto=[];
const tombstone=new Map([[encodeV2Id(original.id),{deleted:true,data:original}]]);
const merged=mergeV1FieldThreeWay({field:'historicoVendas',baseValue:base,localValue:[outraVenda,original],remoteValue:remoto});
assert(merged.some(v=>v.id===original.id),'fixture deve reproduzir a ressurreição do merge antigo');
const reconciliado=reconciliarExclusoesV2({
 field:'historicoVendas',baseValue:base,localValue:[outraVenda,original],mergedValue:merged,records:tombstone,
});
assert.deepEqual(reconciliado,[outraVenda],'remoção remota mantém venda nova e descarta somente referência sem edição');
assert.equal(merged.length,2,'a função não modifica o payload original');
assert.deepEqual(reconciliarExclusoesV2({field:'historicoVendas',baseValue:base,localValue:[original],mergedValue:[original],records:tombstone}),[]);
assert.deepEqual(reconciliarExclusoesV2({field:'historicoVendas',baseValue:base,localValue:[outraVenda],mergedValue:[outraVenda],records:tombstone}),[outraVenda]);

const expectsDeletedConflict=(field,baseValue,localValue,mergedValue,records)=>assert.throws(
 ()=>reconciliarExclusoesV2({field,baseValue,localValue,mergedValue,records}),
 error=>error.code==='ZENOS_ENTITY_DELETED_REMOTE' && error.field===field && String(error.entityId).length>0,
 'alteração explícita de registro excluído deve bloquear o comando sem perder dados',
);
expectsDeletedConflict('historicoVendas',base,[{...original,estado:'concluida'}],[{...original,estado:'concluida'}],tombstone);
expectsDeletedConflict('historicoVendas',[],[original],[original],tombstone);
expectsDeletedConflict('historicoVendas',base,[{...original,itens:[{id:'line-1',qtd:3}]}],[{...original,itens:[{id:'line-1',qtd:3}]}],tombstone);

const voucher={codigo:'CUPOM-REMOVIDO',saldoBRL:50,status:'ativo'};
const voucherTombstone=new Map([[encodeV2Id(voucher.codigo),{deleted:true,data:voucher}]]);
assert.deepEqual(reconciliarExclusoesV2({
 field:'vouchers',baseValue:[voucher],localValue:[voucher],mergedValue:[voucher],records:voucherTombstone,
}),[]);
expectsDeletedConflict('vouchers',[voucher],[{...voucher,saldoBRL:10}],[{...voucher,saldoBRL:10}],voucherTombstone);

const produto={id:'PROD-ANTIGO',nome:'Produto removido',estoque:12};
const prodTombstone=new Map([[encodeV2Id(produto.id),{deleted:true,data:produto}]]);
assert.deepEqual(reconciliarExclusoesV2({
 field:'produtos',baseValue:[produto],localValue:[produto],mergedValue:[produto],records:prodTombstone,
}),[]);
expectsDeletedConflict('produtos',[produto],[{...produto,estoque:11}],[{...produto,estoque:11}],prodTombstone);

assert.deepEqual(reconciliarExclusoesV2({
 field:'regrasDesconto',baseValue:{},localValue:{},mergedValue:{},records:tombstone,
}),{});
assert.deepEqual(reconciliarExclusoesV2({
 field:'historicoVendas',baseValue:base,localValue:base,mergedValue:base,records:new Map(),
}),base,'sem tombstone nenhum registro é removido');

const vivo=new Map([[encodeV2Id(original.id),{deleted:false,data:original}]]);
assert.deepEqual(reconciliarExclusoesV2({
 field:'historicoVendas',baseValue:base,localValue:base,mergedValue:base,records:vivo,
}),base,'registro não excluído permanece intacto');
console.log('Tombstones V2: stale unchanged filtered; explicit edits/recreations rejected; history, stock and vouchers preserved — OK');
