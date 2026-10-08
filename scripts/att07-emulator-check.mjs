import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, collection, doc, onSnapshot, setDoc } from 'firebase/firestore';

const cfg={apiKey:'demo-key',authDomain:'demo-zenos-local.firebaseapp.com',projectId:'demo-zenos-local',appId:'1:1:web:test'};
const appA=initializeApp(cfg,'att07-a');
const appB=initializeApp(cfg,'att07-b');
const authA=getAuth(appA), authB=getAuth(appB);
connectAuthEmulator(authA,'http://127.0.0.1:9099',{disableWarnings:true});
connectAuthEmulator(authB,'http://127.0.0.1:9099',{disableWarnings:true});
const email=`att07-${Date.now()}@example.test`, pass='Teste123456!';
const cred=await createUserWithEmailAndPassword(authA,email,pass);
await (await import('firebase/auth')).signInWithEmailAndPassword(authB,email,pass);
const uid=cred.user.uid;
const dbA=getFirestore(appA), dbB=getFirestore(appB);
connectFirestoreEmulator(dbA,'127.0.0.1',8080);
connectFirestoreEmulator(dbB,'127.0.0.1',8080);
const seenA=new Set(), seenB=new Set();
const waitBoth=()=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Timeout realtime dois terminais')),5000);const check=()=>{if(seenA.has('MOV-A')&&seenA.has('MOV-B')&&seenB.has('MOV-A')&&seenB.has('MOV-B')){clearTimeout(t);resolve();}};globalThis.__check=check;});
const unsubA=onSnapshot(collection(dbA,'lojas',uid,'financeiro_livro'),snap=>{snap.docs.forEach(d=>seenA.add(d.id));globalThis.__check?.();});
const unsubB=onSnapshot(collection(dbB,'lojas',uid,'financeiro_livro'),snap=>{snap.docs.forEach(d=>seenB.add(d.id));globalThis.__check?.();});
const waiting=waitBoth();
await Promise.all([
  setDoc(doc(dbA,'lojas',uid,'financeiro_livro','MOV-A'),{id:'MOV-A',valor:10,createdAt:new Date().toISOString()}),
  setDoc(doc(dbB,'lojas',uid,'financeiro_livro','MOV-B'),{id:'MOV-B',valor:20,createdAt:new Date().toISOString()}),
]);
await waiting;
console.log('[OK] Terminal A recebeu MOV-A e MOV-B em tempo real');
console.log('[OK] Terminal B recebeu MOV-A e MOV-B em tempo real');
console.log('[OK] Escritas independentes não se sobrescreveram');
unsubA();unsubB();
await deleteApp(appA); await deleteApp(appB);
