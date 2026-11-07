// B.4 G1/G6: negative auth and tenant isolation evidence, emulator only.
// Never uses Admin SDK for business operations; no production endpoint can be reached.
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,signOut} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,setDoc,updateDoc} from 'firebase/firestore';

if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||
   process.env.GCLOUD_PROJECT!=='demo-zenos-local')
 throw Error('B4_SECURITY_REFUSES_PRODUCTION');

const apps=[];
const createClient=async(name)=>{
 const app=initializeApp({apiKey:'demo-key',projectId:'demo-zenos-local',
   authDomain:'demo-zenos-local.firebaseapp.com'},'g1-g6-'+name+'-'+Date.now());
 apps.push(app);
 const auth=getAuth(app),db=getFirestore(app);
 connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
 connectFirestoreEmulator(db,'127.0.0.1',8080);
 return {app,auth,db};
};
const owner=await createClient('owner'),other=await createClient('other');
const ownerUid=(await createUserWithEmailAndPassword(owner.auth,
 'owner-'+Date.now()+'@example.test','EmulatorOnly!1248')).user.uid;
const otherUid=(await createUserWithEmailAndPassword(other.auth,
 'other-'+Date.now()+'@example.test','EmulatorOnly!1248')).user.uid;

const denied=async(promise,label)=>{
 try{await promise;assert.fail('UNAUTHORIZED_WRITE_OR_READ_SUCCEEDED:'+label);}
 catch(e){if(String(e.message||'').includes('UNAUTHORIZED_WRITE_OR_READ_SUCCEEDED'))throw e;
  assert.equal(e.code,'permission-denied',label+': '+String(e));}
};
try{
 const root=['lojas',ownerUid];
 const ownDoc=doc(owner.db,...root,'dados','operacao');
 await setDoc(ownDoc,{marker:'G1_OWNER_ONLY',historicoVendas:[],clientes:[]});
 assert.equal((await getDoc(ownDoc)).data().marker,'G1_OWNER_ONLY');
 const foreignDoc=doc(other.db,...root,'dados','operacao');
 await denied(getDoc(foreignDoc),'cross-tenant-read');
 await denied(setDoc(foreignDoc,{marker:'FORGED_TENANT'}),'cross-tenant-write');
 const foreignLedger=doc(other.db,...root,'financeiro_livro','FAKE1');
 await denied(setDoc(foreignLedger,{id:'FAKE1',tipo:'recebimento_fiado',
  valor:1,serverRecordedAt:new Date()}),'cross-tenant-ledger');
 const ownLedger=doc(owner.db,...root,'financeiro_livro','FAKE2');
 await denied(setDoc(ownLedger,{id:'FAKE2',tipo:'recebimento_fiado',valor:1,
  serverRecordedAt:new Date()}),'direct-invalid-ledger-without-transaction');
 const head=doc(owner.db,...root,'v2_generations','0123456789abcdef01234567');
 await denied(setDoc(head,{schema:2,state:'ready',sequence:0}),
  'owner-cannot-forge-v2-generation');
 await denied(updateDoc(head,{sequence:900}),
  'owner-cannot-forge-v2-revision');
 const operation=doc(owner.db,...root,'v2_generations',
  '0123456789abcdef01234567','operations','f'.repeat(64));
 await denied(setDoc(operation,{schema:2,key:'fake',fingerprint:'f'.repeat(64),
  sequence:1,revisions:{},patches:[],financialEntries:[],reads:0,writes:0,
  createdAtClient:new Date().toISOString()}),'owner-cannot-forge-v2-receipt');
 await signOut(other.auth);
 await denied(getDoc(doc(other.db,...root,'dados','operacao')),'unauthenticated-read');
 await denied(setDoc(doc(other.db,...root,'dados','operacao'),{marker:'FAKE'}),
  'unauthenticated-write');
 assert.equal((await getDoc(ownDoc)).data().marker,'G1_OWNER_ONLY');
 console.log('PHASE31_B4_G1_G6_SECURITY_NEGATIVE_SUCCESS');
}finally{
 await Promise.all(apps.map(app=>deleteApp(app)));
}
