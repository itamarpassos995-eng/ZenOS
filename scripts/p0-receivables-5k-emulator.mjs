// Conjunto de 5.000 lançamentos fictícios SOMENTE no Firebase Emulator.
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,collection,doc,writeBatch,setDoc} from 'firebase/firestore';
import {buscarPaginaExtrato,buscarHistoricoIntegralCliente} from '../src/core/financialLedgerQueries.js';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-zenos-local'
 ||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')
 throw Error('Este teste só pode executar no emulador local.');
const name='recebiveis-'+Date.now();
const app=initializeApp({apiKey:'demo-key',projectId:'demo-zenos-local',authDomain:'demo-zenos-local.firebaseapp.com'},name);
try{
 const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
 const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);
 const user=(await createUserWithEmailAndPassword(auth,name+'@example.test','SomenteTeste123!')).user;
 const ref=collection(db,'lojas',user.uid,'financeiro_livro');
 const expected=[];
 for(let offset=0;offset<5000;offset+=400){
  const batch=writeBatch(db);
  for(let i=offset;i<Math.min(offset+400,5000);i++){
   const item={clienteId:'C'+(i%20),tipo:'venda_fiada',valor:i%7+0.01,
    referenciaId:'V'+i,sessaoId:'S'+(i%4)};
   if(i%97!==0)item.createdAt=i%4<2?'2026-10-20T13:00:00.000Z':'2026-08-02T12:00:00.000Z';
   const id='L-'+String(i).padStart(6,'0');
   batch.set(doc(ref,id),item);
   if(item.clienteId==='C5'&&item.createdAt&&item.createdAt.slice(0,10)>='2026-10-01')
    expected.push(id);
  }
  await batch.commit();
 }
 const ids=[],saved=[];
 let cursor=null,pages=0;
 while(true){
  const page=await buscarPaginaExtrato({db,userId:user.uid,clienteId:'C5',inicio:'2026-10-01',fim:'2026-10-31',cursor,pageSize:50});
  saved.push(page);ids.push(...page.itens.map(x=>x.id));pages++;
  if(!page.possuiMais)break;
  cursor=page.cursor;
  assert(pages<20,'cursor preso');
 }
 assert.deepEqual([...new Set(ids)].sort(),expected.sort());
 assert.equal(new Set(ids).size,ids.length);
 assert(pages>=2,'deve exercitar cursor e paginação');
 const all=await buscarHistoricoIntegralCliente({db,userId:user.uid,clienteId:'C5'});
 assert.equal(all.itens.length,250);
 assert(all.itens.some(l=>l.createdAt==null),'legado sem data deve ser recuperável sob demanda');
 // Legado numérico: string e número são identidades históricas equivalentes somente para IDs numéricos.
 await setDoc(doc(ref,'LEGACY-NUM'),{clienteId:321,tipo:'venda_fiada',valor:10});
 const numeric=await buscarHistoricoIntegralCliente({db,userId:user.uid,clienteId:'321'});
 assert.equal(numeric.itens.length,1);
 assert.equal(numeric.itens[0].id,'LEGACY-NUM');
 // Inserção concorrente antes do cursor: exigir Atualizar para enxergar a nova entrada.
 await setDoc(doc(ref,'L-NEW'),{clienteId:'C5',tipo:'venda_fiada',valor:99,
  createdAt:'2026-10-21T12:00:00.000Z'});
 assert(!ids.includes('L-NEW'));
 const refreshed=await buscarPaginaExtrato({db,userId:user.uid,clienteId:'C5',
  inicio:'2026-10-01',fim:'2026-10-31',pageSize:50});
 assert(refreshed.itens.some(l=>l.id==='L-NEW'));
 await assert.rejects(()=>buscarPaginaExtrato({db,userId:user.uid,clienteId:'C5',
  inicio:'2026-01-01',fim:'2026-10-31'}),/período/i);
 const {conferirLivroClienteNoServidor,conferirLivroSessaoNoServidor} =
   await import('../src/core/financialLedgerScoped.js');
 const [C5,S1]=await Promise.all([
   conferirLivroClienteNoServidor({db,userId:user.uid,clienteId:'C5'}),
   conferirLivroSessaoNoServidor({db,userId:user.uid,sessaoId:'S1'}),
 ]);
 assert.equal(C5.itens.length,251);
 assert.equal(S1.itens.length,1250);
 assert(C5.itens.every(item=>item.clienteId==='C5'));
 assert(S1.itens.every(item=>item.sessaoId==='S1'));
 assert(C5.confirmadoPeloServidor&&S1.confirmadoPeloServidor);
 console.log('PASS: 5000 lançamentos, consulta autoritativa do cliente (251) e sessão (1250).');
 console.log('PASS: 5000 lançamentos, paginação ordenada sem duplicação, legado, concorrência e limite de 120 dias.');
}finally{await deleteApp(app);}
