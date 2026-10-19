/**
 * Regras Cloud de homologação operacional, testadas em Firestore Emulator.
 * NÃO utilizar credenciais, projetos nem redes de produção.
 * Executar apenas por firebase emulators:exec com demo-zenos-local.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,deleteDoc,runTransaction,updateDoc} from 'firebase/firestore';

const demo='demo-zenos-local';
const local=v=>/^(localhost|127\.0\.0\.1):\d+$/.test(v||'');
if(process.env.GCLOUD_PROJECT!==demo||!local(process.env.FIRESTORE_EMULATOR_HOST))
 throw Error('Teste das regras HML aceita exclusivamente Firestore Emulator demo-zenos-local.');
if((process.env.FIRESTORE_EMULATOR_HOST||'').includes('zenos-ac6b2'))throw Error('Destino inválido.');
const [host,portText]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
const projectId=demo;
const ownerId='owner-test-uid',otherId='other-test-uid',orderId='ab'.repeat(16);
const markerId='COMMERCE-'+orderId,createdAt='2026-10-19T03:05:00.000Z';
const rules=readFileSync(new URL('../firestore.commerce.operational-hml.rules',import.meta.url),'utf8');
let env;
const ctxOptions={email:'itamarbenit@gmail.com',email_verified:true,firebase:{sign_in_provider:'google.com'}};
const receipt={pedidoId:orderId,vendaId:markerId,criadoEm:createdAt};
const sale={id:markerId,estado:'concluida',origem:'commerce',commercePedidoId:orderId,tipoDocumento:'venda',createdAt,totalBRL:25};
const order={status:'em_atendimento',pdv:{vendaId:markerId,operadorUid:'admin'},cliente:{nome:'Consumidor fictício'}};
const path=(loja,...p)=>['lojas',loja,...p];
try{
 env=await initializeTestEnvironment({projectId,firestore:{host,port:Number(portText),rules}});
 const seed=async()=>{
  await env.withSecurityRulesDisabled(async c=>{
   const db=c.firestore();
   await setDoc(doc(db,...path(ownerId)),{tipo:'homologacao_operacional',homologacaoProprietarioUid:ownerId,testeSomente:true});
   await setDoc(doc(db,...path(otherId)),{tipo:'homologacao_operacional',homologacaoProprietarioUid:otherId,testeSomente:true});
   await setDoc(doc(db,...path(ownerId,'dados','operacao')),{produtos:[{id:'P1',estoque:4}],historicoVendas:[]});
   await setDoc(doc(db,...path(otherId,'dados','operacao')),{produtos:[],historicoVendas:[]});
   await setDoc(doc(db,...path(ownerId,'commerce_pedidos',orderId)),order);
   await setDoc(doc(db,...path(ownerId,'commerce_private','licenca')),{status:'ativo'});
  });
 };
 await seed();
 const owner=env.authenticatedContext(ownerId,ctxOptions).firestore();
 const other=env.authenticatedContext(otherId,ctxOptions).firestore();
 const wrongEmail=env.authenticatedContext(ownerId,{...ctxOptions,email:'visitor@example.test'}).firestore();
 const unverified=env.authenticatedContext(ownerId,{...ctxOptions,email_verified:false}).firestore();
 const wrongProvider=env.authenticatedContext(ownerId,{...ctxOptions,firebase:{sign_in_provider:'password'}}).firestore();
 const anonymous=env.unauthenticatedContext().firestore();
 const opRef=doc(owner,...path(ownerId,'dados','operacao'));
 const marker=doc(owner,...path(ownerId,'commerce_faturamentos',orderId));
 const secret=doc(owner,...path(ownerId,'commerce_private','licenca'));
 const target=doc(owner,...path(otherId,'dados','operacao'));
 const root=doc(owner,...path(ownerId));
 const publicOrder=doc(owner,...path(ownerId,'commerce_pedidos',orderId));
 
 // Caminho feliz mínimo da operação V1 fictícia.
 assert.equal((await assertSucceeds(getDoc(opRef))).data().produtos[0].estoque,4);
 await assertSucceeds(setDoc(doc(owner,...path(ownerId,'dados','configuracoes')),{moeda:'BRL'}));
 await assertSucceeds(setDoc(doc(owner,...path(ownerId,'financeiro_livro','FICTICIO-1')),{valor:10,referenciaId:'demo'}));
 await assertSucceeds(setDoc(doc(owner,...path(ownerId,'estoque_auditoria','P1','movimentos','FICTICIO-1')),{produtoId:'P1',quantidade:1}));
 await assertSucceeds(getDoc(root));
 
 // Isolamento: sem login, outro dono, email errado, não verificado ou password não entram.
 for(const client of [other,wrongEmail,unverified,wrongProvider,anonymous])
  await assertFails(getDoc(doc(client,...path(ownerId,'dados','operacao'))));
 await assertFails(getDoc(target));
 await assertFails(setDoc(target,{produtos:[]}));
 await assertFails(setDoc(root,{status:'ativo'}));
 await assertFails(deleteDoc(root));
 await assertFails(setDoc(doc(owner,...path(ownerId,'dados','storage_control')),{mode:'v2',generation:'forjada'}));
 await assertFails(updateDoc(doc(owner,...path(ownerId,'dados','storage_control')),{mode:'v2'}));
 await assertFails(getDoc(secret));
 await assertFails(setDoc(secret,{ativo:true}));
 await assertFails(getDoc(publicOrder));
 await assertFails(updateDoc(publicOrder,{status:'encerrado'}));
 await assertFails(setDoc(doc(owner,...path(ownerId,'commerce_quotas','fake')),{total:99999}));
 await assertFails(setDoc(doc(owner,...path(ownerId,'v2_generations','fake')),{state:'ready'}));
 await assertFails(setDoc(doc(owner,'commerce_operator_access',ownerId),{ativo:true}));
 // Não basta conhecer o id do pedido para criar faturamento.
 await assertFails(setDoc(marker,receipt));
 await assertFails(setDoc(marker,{...receipt,pedidoId:'cd'.repeat(16)}));
 await assertFails(setDoc(marker,{...receipt,criadoEm:25}));
 
 // A venda validada entra simultaneamente com recibo; sem bypass de cheque V1.
 await assertSucceeds(runTransaction(owner,async tx=>{
  const cur=await tx.get(opRef);
  assert.equal(cur.data().historicoVendas.length,0);
  tx.update(opRef,{historicoVendas:[sale],produtos:[{id:'P1',estoque:2}]});
  tx.set(marker,receipt);
 }));
 assert.equal((await assertSucceeds(getDoc(marker))).data().vendaId,markerId);
 assert.equal((await assertSucceeds(getDoc(opRef))).data().produtos[0].estoque,2);
 await assertFails(setDoc(marker,receipt));
 await assertFails(updateDoc(marker,{criadoEm:'changed'}));
 await assertFails(deleteDoc(marker));
 await assertFails(getDoc(doc(other,...path(ownerId,'commerce_faturamentos',orderId))));
 
 // Sem fallback ou limpeza depois do faturamento.
 await assertFails(setDoc(doc(owner,...path(ownerId,'commerce_faturamentos','cd'.repeat(16))),{...receipt,pedidoId:'cd'.repeat(16),vendaId:'COMMERCE-'+('cd'.repeat(16))}));
 console.log('PASSOU: regras Firestore HML operacional — dono Google válido, bloqueio multiloja/privado/recibos, uma venda e recibo imutável (emulador somente).');
}finally{await env?.cleanup();}
