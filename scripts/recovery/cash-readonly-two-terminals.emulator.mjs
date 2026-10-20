// E2E somente Firebase Emulator; dois clientes lendo a mesma fonte.
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,setDoc,deleteDoc} from 'firebase/firestore';
import {verificarMovimentoCaixaNoServidor} from '../../src/core/cashMovementReadOnly.js';
import {clearOperationalSession} from '../../src/core/operationalRepository.js';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-zenos-local')
 throw new Error('Firebase emulator required; production prohibited');
const config={apiKey:'demo-key',projectId:'demo-zenos-local',authDomain:'demo-zenos-local.firebaseapp.com'};
const key=Date.now().toString(36),a=initializeApp(config,'cash-a-'+key),b=initializeApp(config,'cash-b-'+key);
try{
 const authA=getAuth(a),authB=getAuth(b);
 connectAuthEmulator(authA,'http://127.0.0.1:9099',{disableWarnings:true});
 connectAuthEmulator(authB,'http://127.0.0.1:9099',{disableWarnings:true});
 const email='cash-'+key+'@example.test',pass='OnlyEmulator!123';
 const u=(await createUserWithEmailAndPassword(authA,email,pass)).user;
 await signInWithEmailAndPassword(authB,email,pass);
 const dbA=getFirestore(a),dbB=getFirestore(b);
 connectFirestoreEmulator(dbA,'127.0.0.1',8080);
 connectFirestoreEmulator(dbB,'127.0.0.1',8080);
 const tentativa={id:'10203',sessaoId:'cx-test',tipo:'sangria',valorBRL:10};
 const mov={...tentativa};
 const movRef=doc(dbA,'lojas',u.uid,'dados','operacao');
 const ledRef=doc(dbA,'lojas',u.uid,'financeiro_livro','CAIXA-10203');
 await setDoc(movRef,{caixaMovimentos:[mov],_syncMeta:{fieldRevisions:{caixaMovimentos:1}}});
 await setDoc(ledRef,{id:'CAIXA-10203',referenciaId:'10203',sessaoId:'cx-test',tipo:'sangria',valor:10,origem:'caixa_manual'});
 const [ra,rb]=await Promise.all([verificarMovimentoCaixaNoServidor({db:dbA,userId:u.uid,tentativa}),verificarMovimentoCaixaNoServidor({db:dbB,userId:u.uid,tentativa})]);
 assert.equal(ra.status,'confirmed');assert.equal(rb.status,'confirmed');
 await deleteDoc(ledRef);
 const miss=await verificarMovimentoCaixaNoServidor({db:dbA,userId:u.uid,tentativa});
 assert.equal(miss.status,'unknown');
 await setDoc(ledRef,{id:'CAIXA-10203',referenciaId:'10203',sessaoId:'cx-test',tipo:'sangria',valor:30,origem:'caixa_manual'});
 const mismatch=await verificarMovimentoCaixaNoServidor({db:dbB,userId:u.uid,tentativa});
 assert.equal(mismatch.status,'conflict');
 console.log('PASS: 2 sessions, committed / unconfirmed / divergent ledger; no reissued cash mutations');
 clearOperationalSession(dbA,u.uid);clearOperationalSession(dbB,u.uid);
}finally{await deleteApp(a);await deleteApp(b);}
