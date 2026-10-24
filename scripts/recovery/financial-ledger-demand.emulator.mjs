import assert from 'node:assert/strict';
import { initializeApp,deleteApp } from 'firebase/app';
import { getAuth,connectAuthEmulator,createUserWithEmailAndPassword,signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore,connectFirestoreEmulator,doc,setDoc } from 'firebase/firestore';
import { consultarLivroFinanceiroSessaoServidor } from '../../src/core/financialLedger.js';
import { calcularConciliacaoEletronicaSessao } from '../../src/core/cashSession.js';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099'||process.env.GCLOUD_PROJECT!=='demo-zenos-local')
 throw new Error('Este teste somente roda em emuladores locais Firebase.');
const tag=Date.now().toString(),config={apiKey:'demo-key',projectId:'demo-zenos-local',authDomain:'demo-zenos-local.firebaseapp.com'};
const a=initializeApp(config,'ledger-a-'+tag),b=initializeApp(config,'ledger-b-'+tag);
try {
 const aa=getAuth(a),ab=getAuth(b);
 connectAuthEmulator(aa,'http://127.0.0.1:9099',{disableWarnings:true});
 connectAuthEmulator(ab,'http://127.0.0.1:9099',{disableWarnings:true});
 const email='ledger-'+tag+'@example.test',password='LedgerOnly!456';
 const u=(await createUserWithEmailAndPassword(aa,email,password)).user;
 await signInWithEmailAndPassword(ab,email,password);
 const dba=getFirestore(a),dbb=getFirestore(b);
 connectFirestoreEmulator(dba,'127.0.0.1',8080);
 connectFirestoreEmulator(dbb,'127.0.0.1',8080);
 const base=['lojas',u.uid,'financeiro_livro'];
 const criar=(id,sessaoId,formaPagamento,valor,direcao='entrada')=>setDoc(doc(dba,...base,id),{
   id,lojaId:u.uid,referenciaId:id,tipo:'venda',createdAt:new Date().toISOString(),
   sessaoId,formaPagamento,valor,direcao,
 });
 const outras=Array.from({length:150},(_,i)=>criar('antigo-'+i,'turno-velho','pix',100));
 for(let i=0;i<outras.length;i+=15)await Promise.all(outras.slice(i,i+15));
 await criar('a','turno-atual','pix',120);
 await criar('b','turno-atual','cartao_credito',45);
 await criar('c','turno-atual','pix',20,'saida');
 const agora=await consultarLivroFinanceiroSessaoServidor({db:dbb,userId:u.uid,sessaoId:'turno-atual'});
 assert.deepEqual(agora.map(x=>x.id).sort(),['a','b','c']);
 const conciliacao=calcularConciliacaoEletronicaSessao({sessao:{id:'turno-atual'},livroFinanceiro:agora});
 assert.equal(conciliacao.pixEntradas,120);
 assert.equal(conciliacao.pixSaidas,20);
 assert.equal(conciliacao.cartaoCreditoEntradas,45);
 assert.equal(conciliacao.cartaoDebitoEntradas,0);
 await criar('d','turno-atual','cartao_debito',80);
 const atualizado=await consultarLivroFinanceiroSessaoServidor({db:dbb,userId:u.uid,sessaoId:'turno-atual'});
 assert.equal(atualizado.length,4);
 assert.equal(calcularConciliacaoEletronicaSessao({sessao:{id:'turno-atual'},livroFinanceiro:atualizado}).cartaoDebitoEntradas,80);
 await assert.rejects(consultarLivroFinanceiroSessaoServidor({db:dbb,userId:u.uid,sessaoId:''}));
 console.log('PASS: 2 terminais, 150 entradas antigas excluídas e conciliação confirmada.');
} finally {await deleteApp(a);await deleteApp(b);}
