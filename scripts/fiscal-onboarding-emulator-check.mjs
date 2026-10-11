import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

const app=initializeApp({
 apiKey:'demo-api-key',authDomain:'demo-zenos-local.firebaseapp.com',projectId:'demo-zenos-local',appId:'1:000000000000:web:zenoslocal'
},'fiscal-onboarding-e2e');
const auth=getAuth(app),db=getFirestore(app),functions=getFunctions(app,'southamerica-east1');
connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
connectFirestoreEmulator(db,'127.0.0.1',8080);
connectFunctionsEmulator(functions,'127.0.0.1',5001);
const chamar=httpsCallable(functions,'fiscalSolicitacaoCliente');
const conta=await createUserWithEmailAndPassword(auth,`fiscal-e2e-${Date.now()}@zenos.test`,'Teste-Seguro-2026!');
const lojaId=conta.user.uid;
try{
 await setDoc(doc(db,'lojas',lojaId),{status:'ativo',plano:'basico'});
 const referencia=doc(db,'lojas',lojaId,'dados','operacao');
 await setDoc(referencia,{historicoVendas:[{id:'V1',total:100}],marcador:'NAO_MEXER'});
 const inicial=await chamar({action:'consultar',lojaId});
 assert.equal(inicial.data.status,'nao_solicitado');
 await assert.rejects(()=>chamar({action:'solicitar',lojaId:'outra-loja',pais:'BR',cadastro:{razaoSocial:'Teste',cnpj:'11222333000181',email:'teste@example.com'}}));
 const enviado=await chamar({action:'solicitar',lojaId,pais:'BR',cadastro:{razaoSocial:'Loja Teste',cnpj:'11.222.333/0001-81',email:'teste@example.com'}});
 assert.equal(enviado.data.status,'em_analise');
 assert.equal(enviado.data.habilitado,false);
 const consulta=await chamar({action:'consultar',lojaId});
 assert.equal(consulta.data.cadastro.cnpj,'11222333000181');
 assert.equal(consulta.data.status,'em_analise');
 const comercial=await getDoc(referencia);
 assert.deepEqual(comercial.data(),{historicoVendas:[{id:'V1',total:100}],marcador:'NAO_MEXER'});
 console.log('Onboarding fiscal emulator: solicitação, leitura, isolamento e dados comerciais OK');
}finally{
 await deleteApp(app);
}
