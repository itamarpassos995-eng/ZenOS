import assert from 'node:assert/strict';
import {businessOperationChecks} from '../src/core/productionSync.js';
const client={id:1790633161249,nome:'Constructora del Este S.A.',saldoDevedorBRL:4999.70};
const normalized={...client,pais:'PY',tipoDocumento:'RUC',perfilPreco:'preco2',diasAtraso:0};
const guard={type:'client_receipt_snapshot',clientId:client.id,clientName:client.nome,balanceBRL:4999.70};
// A nuvem pode conter um cadastro legado menor que o objeto normalizado na tela.
assert.notDeepEqual(normalized,client);
assert.doesNotThrow(()=>businessOperationChecks.assertBusinessGuards({clientes:[client]},[guard]));
// Bloquear concorrência, saldo desatualizado, nome trocado e IDs duplicados.
for(const list of [
  [{...client,saldoDevedorBRL:4999.71}],
  [{...client,nome:'Marcos Roberto'}],
  [client,client],
  [{...client,id:1790633161250}],
]){
  assert.throws(()=>businessOperationChecks.assertBusinessGuards({clientes:list},[guard]),
    e=>e.code==='ZENOS_CLIENT_RECEIPT_CONFLICT');
}
console.log('PASS P0: original registration metadata not required; mismatched ID, name, balance, duplicate protected');
