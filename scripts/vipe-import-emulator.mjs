import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer } from 'firebase/firestore';
import { persistV1BusinessOperationSafe } from '../src/core/productionSync.js';
const config={apiKey:'demo-key',authDomain:'demo-zenos-local.firebaseapp.com',projectId:'demo-zenos-local'};
const app=initializeApp(config,'vipe-emul-'+Date.now()),auth=getAuth(app),db=getFirestore(app);
connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
connectFirestoreEmulator(db,'127.0.0.1',8080);
try {
 const cred=await createUserWithEmailAndPassword(auth,'vipe-test-'+Date.now()+'@example.test','TesteZenOS!8427'),uid=cred.user.uid;
 const produtos=Array.from({length:450},(_,i)=>({id:'VIPE-PROD-'+(i+1),sku:'VIPE-SKU-'+(i+1),nome:'Produto '+i,grupo:'Geral',custoBRL:10,precoBRL:20,estoque:i<86?0:3,ativo:true,inativo:false,arquivado:false,oculto:false,origemMigracao:'VIPE-FPX',idOrigemMigracao:String(i+1)}));
 const clientes=Array.from({length:1695},(_,i)=>({id:'VIPE-CLI-'+(i+1),nome:'CLI'+i,pais:'PY',tipoDocumento:'RUC',limiteCreditoBRL:0,saldoDevedorBRL:0,origemMigracao:'VIPE-FPX',idOrigemMigracao:String(i+1)}));
 const fornecedores=Array.from({length:17},(_,i)=>({id:'VIPE-FORN-'+(i+1),nome:'Fornecedor '+i,pais:'PY',origemMigracao:'VIPE-FPX',idOrigemMigracao:String(i+1)}));
 const result=await persistV1BusinessOperationSafe({db,userId:uid,operationKey:'vipe-test-batch-v1',changes:[{field:'produtos',baseValue:[],value:produtos},{field:'clientes',baseValue:[],value:clientes},{field:'fornecedores',baseValue:[],value:fornecedores}]});
 assert.equal(result.cloudOk,true,'Falha na gravação: '+String(result.error?.message||''));
 const snap=await getDocFromServer(doc(db,'lojas',uid,'dados','operacao'));assert.equal(snap.exists(),true);
 for(const [field,n] of [['produtos',450],['clientes',1695],['fornecedores',17]])assert.equal(snap.data()[field]?.length,n);
 assert.equal(new Set(snap.data().produtos.map(x=>x.id)).size,450);assert.equal(new Set(snap.data().clientes.map(x=>x.id)).size,1695);
 assert.equal(snap.data().produtos.filter(x=>x.estoque<0||x.inativo||x.arquivado||x.oculto).length,0);
 console.log('VIPE: 2162 registros sintéticos gravados, relidos e conferidos no emulador.');
} finally {await deleteApp(app)}
