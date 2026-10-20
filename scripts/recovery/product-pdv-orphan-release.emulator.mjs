import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,setDoc,getDocFromServer,updateDoc} from 'firebase/firestore';
import {liberarIndiceOrfaoPDV} from '../../src/core/productOrphanRelease.js';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-zenos-local')
 throw new Error('Requer Firebase Emulator; proibido executar em produção.');
const config={apiKey:'demo-key',projectId:'demo-zenos-local',authDomain:'demo-zenos-local.firebaseapp.com'};
const tag=String(Date.now()),a=initializeApp(config,'pdv-a-'+tag),b=initializeApp(config,'pdv-b-'+tag);
try{
 const au=getAuth(a),bu=getAuth(b);
 connectAuthEmulator(au,'http://127.0.0.1:9099',{disableWarnings:true});
 connectAuthEmulator(bu,'http://127.0.0.1:9099',{disableWarnings:true});
 const email='pdv-orphan-'+tag+'@example.test',password='Demo-Only!123';
 const user=(await createUserWithEmailAndPassword(au,email,password)).user;
 await signInWithEmailAndPassword(bu,email,password);
 const db=getFirestore(a),other=getFirestore(b);
 connectFirestoreEmulator(db,'127.0.0.1',8080);
 connectFirestoreEmulator(other,'127.0.0.1',8080);
 const uid=user.uid,owner='PROD-BALCAO-1792011001001',sku='66346',past='2026-10-18T12:00:00Z';
 const opRef=doc(db,'lojas',uid,'dados','operacao');
 await setDoc(opRef,{produtos:[],historicoVendas:[],historicoCompras:[]});
 const indexRef=doc(db,'lojas',uid,'produto_indices','sku_historicoTeste');
 const sigRef=doc(db,'lojas',uid,'produto_indices','sig_historicoTeste');
 await setDoc(indexRef,{produtoId:owner,sku,nome:'Pneu de teste',ativo:true,updatedAt:past});
 await setDoc(sigRef,{produtoId:owner,sku:'',nome:'Pneu de teste',ativo:true,updatedAt:past});
 let x=await liberarIndiceOrfaoPDV({db:other,userId:uid,sku,ownerId:owner,operadorId:'adm'});
 assert.equal(x.status,'released',JSON.stringify(x));
 assert.equal((await getDocFromServer(indexRef)).data().ativo,false);
 assert.equal((await getDocFromServer(sigRef)).data().ativo,false);
 assert.equal((await getDocFromServer(opRef)).data().produtos.length,0);
 // Índice reutilizado por outra loja/cliente jamais pode ser liberado.
 await updateDoc(indexRef,{ativo:true,produtoId:'OUTRO-PRODUTO'});
 x=await liberarIndiceOrfaoPDV({db:other,userId:uid,sku,ownerId:owner,operadorId:'adm'});
 assert.equal(x.status,'blocked');
 assert.equal((await getDocFromServer(indexRef)).data().produtoId,'OUTRO-PRODUTO');
 // Produto recuperado: proibição de alterar índice.
 await updateDoc(indexRef,{ativo:true,produtoId:owner});
 await updateDoc(sigRef,{ativo:true,produtoId:owner});
 await setDoc(opRef,{produtos:[{id:owner,sku,nome:'Pneu de teste'}],historicoVendas:[],historicoCompras:[]});
 x=await liberarIndiceOrfaoPDV({db:other,userId:uid,sku,ownerId:owner,operadorId:'adm'});
 assert.equal(x.status,'blocked');
 assert.equal((await getDocFromServer(indexRef)).data().ativo,true);
 console.log('PASS: dois terminais, somente índice órfão, conflito e cadastro real protegidos');
}finally{await deleteApp(a);await deleteApp(b);}
