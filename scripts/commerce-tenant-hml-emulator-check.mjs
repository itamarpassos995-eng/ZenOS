/* Teste real com 2 usuarios e emuladores — NUNCA usar Firebase de producao.
GCLOUD_PROJECT=demo-zenos-local ZENOS_COMMERCE_MEDIA_ENABLED=false firebase emulators:exec --project demo-zenos-local \
 --config firebase.commerce.homologacao.json --only auth,firestore,functions,storage \
 'node scripts/commerce-tenant-hml-emulator-check.mjs'
*/
import assert from 'node:assert/strict';
import {createHash,pbkdf2Sync} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp:initAdmin}=require('firebase-admin/app');
const {getFirestore:adminFirestore}=require('firebase-admin/firestore');
const {getAuth:adminAuth}=require('firebase-admin/auth');
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInAnonymously,signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,setDoc,getDoc} from 'firebase/firestore';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {getStorage,connectStorageEmulator,ref,uploadBytes,getBytes} from 'firebase/storage';

const local=s=>/^(127\.0\.0\.1|localhost):\d+$/.test(String(s||''));
if(process.env.GCLOUD_PROJECT!=='demo-zenos-local' ||
 !local(process.env.FIRESTORE_EMULATOR_HOST) ||
 !local(process.env.FIREBASE_AUTH_EMULATOR_HOST) ||
 !local(process.env.FIREBASE_STORAGE_EMULATOR_HOST))
 throw Error('Ambiente inseguro: teste aceita apenas emuladores locais demo-zenos-local.');
const cfg={apiKey:'demo-zenos-local',authDomain:'demo-zenos-local.firebaseapp.com',
 projectId:'demo-zenos-local',storageBucket:'demo-zenos-local.appspot.com',appId:'1:000000000000:web:zenoscommerce'};
const apps=[];
async function client(name,credentials){
 const app=initializeApp(cfg,name);apps.push(app);
 const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
 const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);
 const fns=getFunctions(app,'southamerica-east1');connectFunctionsEmulator(fns,'127.0.0.1',5001);
 const storage=getStorage(app);connectStorageEmulator(storage,'127.0.0.1',9199);
 const uid=(await (credentials?signInWithEmailAndPassword(auth,credentials.email,credentials.password):signInAnonymously(auth))).user.uid;
 return {uid,db,fns,storage};
}
async function forbid(p){
 await assert.rejects(p,e=>/permission-denied|unauthorized|PERMISSION_DENIED|storage\/unauthorized/.test(String(e?.code||'')+' '+String(e?.message||'')));
}
try{
 const a=await client('commerce-loja-A'),b=await client('commerce-loja-B');
 assert.notEqual(a.uid,b.uid);
 for(const x of [a,b]){
  await setDoc(doc(x.db,'lojas',x.uid),{tipo:'homologacao'});
  await setDoc(doc(x.db,'lojas',x.uid,'dados','operacao'),{produtos:[{id:'P-1',nome:'Produto demo',estoque:2,imagem:'data:image/webp;base64,ORIGINAL_PRESERVADO'}]});
  assert.equal((await getDoc(doc(x.db,'lojas',x.uid,'dados','operacao'))).data().produtos[0].id,'P-1');
 }
 await forbid(getDoc(doc(a.db,'lojas',b.uid,'dados','operacao')));
 await forbid(setDoc(doc(a.db,'lojas',b.uid,'dados','operacao'),{produtos:[]}));
 await forbid(getDoc(doc(b.db,'lojas',a.uid)));
 await forbid(setDoc(doc(b.db,'lojas',a.uid),{status:'alterado'}));
 await forbid(getDoc(doc(a.db,'lojas',a.uid,'commerce_private','rascunho')));
 await forbid(setDoc(doc(a.db,'lojas',a.uid,'commerce_private','licenca'),{status:'ativo',ativacaoConfirmadaServidor:true}));
 await forbid(uploadBytes(ref(a.storage,'commerce/'+a.uid+'/produtos/P-1/galeria/a.webp'),new Uint8Array([0,1,2]),{contentType:'image/webp'}));
 await forbid(uploadBytes(ref(a.storage,'commerce/'+b.uid+'/produtos/P-1/galeria/a.webp'),new Uint8Array([0,1,2]),{contentType:'image/webp'}));
 const admin=initAdmin({projectId:cfg.projectId},'commerce-test-admin');
 const adb=adminFirestore(admin);
 const identities=[];
 for(const shop of [a,b]){
  const email=`admin-${shop.uid}@commerce.invalid`,password='Hml-'+crypto.randomUUID();
  const user=await adminAuth(admin).createUser({email,password,emailVerified:true});
  const operator=await client('operator-'+shop.uid,{email,password});
  await adb.doc(`commerce_operator_access/${user.uid}`).set({ativo:true,papel:'admin',lojaId:shop.uid});
  identities.push(operator);
 }
 const [operatorA,operatorB]=identities;
 await forbid(httpsCallable(a.fns,'commerceStudio')({action:'consultar'}));
 await forbid(httpsCallable(a.fns,'commerceMidia')({action:'enviarFotoProduto'}));
 await forbid(getDoc(doc(operatorA.db,'commerce_operator_access',operatorA.uid)));
 await forbid(setDoc(doc(operatorA.db,'commerce_operator_access',operatorA.uid),{ativo:true,papel:'admin',lojaId:b.uid}));
 await forbid(setDoc(doc(a.db,'commerce_operator_access',a.uid),{ativo:true,papel:'admin',lojaId:a.uid}));
 const fnA=httpsCallable(operatorA.fns,'commerceStudio'),fnB=httpsCallable(operatorB.fns,'commerceStudio');
 const grant=adb.doc(`commerce_operator_access/${operatorA.uid}`);
 await grant.update({papel:'operador'});
 await forbid(fnA({action:'consultar',papel:'admin'}));
 await forbid(httpsCallable(operatorA.fns,'commerceMidia')({action:'enviarFotoProduto'}));
 await grant.update({papel:'admin',ativo:false});
 await forbid(fnA({action:'consultar'}));
 await grant.update({ativo:true});

 // Integração sem segunda conta: a sessão password atual é a identidade da loja.
 const pinSessao='839275',saltSessao='ab'.repeat(16),credencialId='operador-'+createHash('sha256').update('caixa-1').digest('hex'),credencialRef=adb.doc(`lojas/${operatorA.uid}/commerce_private/${credencialId}`);
 const credencial={ativo:true,papel:'admin',versao:1,pinVersion:2,pinSalt:saltSessao,pinHash:pbkdf2Sync(pinSessao,Buffer.from(saltSessao,'hex'),120000,32,'sha256').toString('hex')};
 await adb.doc(`lojas/${operatorA.uid}`).set({tipo:'homologacao'});
 await credencialRef.set(credencial);
 const bridge=httpsCallable(operatorA.fns,'commerceSessaoZenOS');
 await forbid(bridge({operadorId:'caixa-1',pin:'999999'}));
 await assert.rejects(httpsCallable(a.fns,'commerceSessaoZenOS')({operadorId:'caixa-1',pin:pinSessao}),e=>e.code==='functions/unauthenticated');
 await forbid(getDoc(doc(operatorA.db,'lojas',operatorA.uid,'commerce_private',credencialId)));
 await forbid(setDoc(doc(operatorA.db,'lojas',operatorA.uid,'commerce_private',credencialId),{...credencial,papel:'admin'}));
 const sessaoIntegrada=(await bridge({operadorId:'caixa-1',pin:pinSessao})).data;
 assert.equal(sessaoIntegrada.lojaId,operatorA.uid);assert.equal(sessaoIntegrada.operadorId,'caixa-1');
 const consultaIntegrada={action:'consultar',sessaoZenOS:sessaoIntegrada.sessaoZenOS};
 assert.equal((await fnA(consultaIntegrada)).data.lojaId,operatorA.uid);
 await forbid(fnB(consultaIntegrada));
 await credencialRef.update({ativo:false});await forbid(fnA(consultaIntegrada));
 await credencialRef.update({ativo:true,versao:2});await forbid(fnA(consultaIntegrada));
 await credencialRef.update({versao:1});
 const limiteRef=adb.doc(`lojas/${operatorA.uid}/commerce_private/acesso-${(await import('node:crypto')).createHash('sha256').update('caixa-1').digest('hex')}`);
 await limiteRef.set({inicio:Date.now(),tentativas:5});
 await assert.rejects(bridge({operadorId:'caixa-1',pin:pinSessao}),e=>/resource-exhausted/.test(e.code));
 console.log('PASSOU: sessão ZenOS/PIN privado, isolamento, revogação, versão e bloqueio de tentativas.');
 const init=(await fnA({action:'consultar'})).data;
 assert.equal(init.publicacaoHabilitada,false);assert.equal(init.licenca.ativo,false);
 await assert.rejects(fnA({action:'consultar',lojaId:b.uid}),e=>/invalid-argument/.test(String(e.code)));
 const saved=(await fnA({action:'salvarRascunho',expectedRevision:0,rascunho:{aparencia:{nomeLoja:'A'},regras:{}}})).data;
 assert.equal(saved.revision,1);
 assert.equal((await fnA({action:'consultar'})).data.revision,1);
 assert.equal((await fnB({action:'consultar'})).data.revision,0);
 // Duas abas disputando a mesma revisão: apenas uma pode persistir.
 const concorrentes=await Promise.allSettled(['A-aba-1','A-aba-2'].map(nomeLoja=>
  fnA({action:'salvarRascunho',expectedRevision:1,rascunho:{aparencia:{nomeLoja},regras:{}}})));
 assert.equal(concorrentes.filter(r=>r.status==='fulfilled').length,1);
 const rejeitada=concorrentes.find(r=>r.status==='rejected');
 assert.match(String(rejeitada?.reason?.code),/aborted/);
 assert.equal((await fnA({action:'consultar'})).data.revision,2);
 assert.equal((await fnB({action:'consultar'})).data.revision,0);

 await forbid(getDoc(doc(b.db,'lojas',a.uid,'commerce_private','rascunho')));
 if(process.env.ZENOS_COMMERCE_MEDIA_ENABLED==='true'){
  const webp='UklGRmIAAABXRUJQVlA4IFYAAACwBgCdASp4AHgAPm02mUmkIyKhIIgAgA2JaW7hdJlwAAE9tiLxBUc9sReIKjntiLxBUc9sReIKjntiLxBNgAD+/paf//tTBJGUv//dBlnDdIAAAAAAAA==';
  const media=httpsCallable(operatorA.fns,'commerceMidia');
  const payload={action:'enviarFotoProduto',produtoId:'P-1',principalBase64:webp,miniaturaBase64:webp};
  const uploaded=(await media(payload)).data;
  assert.equal(uploaded.status,'privado');
  assert.ok(uploaded.storagePath.startsWith('commerce/'+a.uid+'/'));
  assert.equal((await media(payload)).data.storagePath,uploaded.storagePath);
  assert.ok(Date.parse(uploaded.expiraEm)>Date.now()+29*60_000);
  assert.ok(Date.parse(uploaded.expiraEm)<=Date.now()+30*60_000);
  await forbid(getBytes(ref(a.storage,uploaded.storagePath)));
  await forbid(getBytes(ref(b.storage,uploaded.storagePath)));
  await assert.rejects(media({...payload,produtoId:'produto-ausente'}),e=>/permission-denied/.test(e.code));
  await assert.rejects(media({...payload,principalBase64:'AAAA'}),e=>/invalid-argument/.test(e.code));
  const bannerUpload=(await media({...payload,action:'enviarBanner',bannerId:'b-1',tipo:'desktop'})).data;
  const mobileUpload=(await media({...payload,action:'enviarBanner',bannerId:'b-1',tipo:'mobile'})).data;
  const aparenciaBanner={banners:[{id:'b-1',titulo:'Campanha',imagemDesktopStoragePath:bannerUpload.storagePath,imagemDesktop:bannerUpload.url,imagemMobileStoragePath:mobileUpload.storagePath}]};
  await forbid(getBytes(ref(a.storage,bannerUpload.storagePath)));
  await forbid(getBytes(ref(b.storage,bannerUpload.storagePath)));
  await assert.rejects(fnB({action:'salvarRascunho',expectedRevision:0,rascunho:{aparencia:aparenciaBanner,regras:{}}}),e=>/invalid-argument|permission-denied/.test(e.code));
  await assert.rejects(fnA({action:'salvarRascunho',expectedRevision:2,rascunho:{aparencia:{banners:[{id:'b-2',imagemDesktopStoragePath:bannerUpload.storagePath}]},regras:{}}}),e=>/invalid-argument/.test(e.code));
  const rule={publicado:true,galeriaImagens:[{...uploaded,ordem:0}]};
  await fnA({action:'salvarRascunho',expectedRevision:2,rascunho:{aparencia:{...aparenciaBanner,nomeLoja:'Galeria A'},regras:{'P-1':rule}}});
  const restored=(await fnA({action:'consultar'})).data;
  assert.match(restored.aparencia.banners[0].imagemDesktop,/Signature=/);
  assert.equal((await adb.doc(`lojas/${a.uid}/commerce_private/rascunho`).get()).data().aparencia.banners[0].imagemDesktop,'');
  assert.equal(restored.regras['P-1'].galeriaImagens[0].storagePath,uploaded.storagePath);
  assert.match(restored.regras['P-1'].galeriaImagens[0].miniaturaUrl,/Signature=/);
  await assert.rejects(fnB({action:'salvarRascunho',expectedRevision:0,rascunho:{aparencia:{},regras:{'P-1':rule}}}),e=>/invalid-argument|permission-denied/.test(e.code));
  const original=(await media({...payload,origem:'cadastro'})).data;
  await fnA({action:'salvarRascunho',expectedRevision:3,rascunho:{aparencia:aparenciaBanner,regras:{'P-1':{...rule,fotoCadastroStoragePath:original.storagePath}}}});
  assert.match((await fnA({action:'consultar'})).data.regras['P-1'].fotoCadastroPreviewUrl,/Signature=/);
  assert.equal((await getDoc(doc(a.db,'lojas',a.uid,'dados','operacao'))).data().produtos[0].imagem,'data:image/webp;base64,ORIGINAL_PRESERVADO');

  const mediaQuota=adb.doc(`lojas/${a.uid}/commerce_private/midia-quota-${new Date().toISOString().slice(0,10)}`);
  const budget=(await mediaQuota.get()).data();assert.equal(budget.arquivos,4);
  await mediaQuota.set({...budget,bytes:60_000_000});
  const operationRef=adb.doc(`lojas/${a.uid}/dados/operacao`),before=(await operationRef.get()).data();
  await operationRef.set({...before,produtos:[...before.produtos,{id:'P-2',nome:'Quota demo',estoque:1}]});
  await assert.rejects(media({...payload,produtoId:'P-2'}),e=>/resource-exhausted/.test(e.code));
  await operationRef.set(before);await mediaQuota.set(budget);
  const adminA=httpsCallable(operatorA.fns,'commercePedidosAdmin'),adminB=httpsCallable(operatorB.fns,'commercePedidosAdmin');
  await forbid(adminA({action:'publicar',expectedRevision:4,whatsapp:'5567999991234'}));
  for(const shop of [a,b])await adb.doc(`lojas/${shop.uid}/commerce_private/licenca`).set({status:'ativo',ativacaoConfirmadaServidor:true});
  await fnB({action:'salvarRascunho',expectedRevision:0,rascunho:{aparencia:{},regras:{}}});
  await assert.rejects(adminB({action:'publicar',expectedRevision:1,whatsapp:'5567999991234'}),e=>/failed-precondition/.test(e.code));
  const opRef=adb.doc(`lojas/${a.uid}/dados/operacao`),operacao=(await opRef.get()).data();
  operacao.produtos[0].preco1BRL=9.9;operacao.produtos[0].custo=1;operacao.produtos[0].fornecedor='SEGREDO';await opRef.set(operacao);
  const published=(await adminA({action:'publicar',expectedRevision:4,whatsapp:'5567999991234'})).data;
  assert.match(published.idPublico,/^zc-[a-z2-9]{14}$/);
  const buyer=await client('comprador-publico'),lojaApi=httpsCallable(buyer.fns,'commerceLoja');
  const publico=(await lojaApi({action:'catalogo',idPublico:published.idPublico})).data;
  assert.equal(publico.catalogo[0].precoCentavos,990);assert.ok(!JSON.stringify(publico).includes('SEGREDO'));assert.ok(!JSON.stringify(publico).includes(a.uid+'\"'));
  assert.ok(publico.catalogo[0].imagens.length>=2);
  assert.match(publico.aparencia.banners[0].imagemDesktop,/Signature=/);
  assert.match(publico.aparencia.banners[0].imagemMobile,/Signature=/);
  assert.ok(!('imagemDesktopStoragePath' in publico.aparencia.banners[0]));
  await forbid(getDoc(doc(buyer.db,'commerce_public',published.idPublico)));
  const envio={action:'criarPedido',idPublico:published.idPublico,revision:published.revision,chaveEnvio:crypto.randomUUID(),totalCentavos:1980,pedido:{nome:'Comprador Teste',telefone:'5567999991234',aceiteContato:true,itens:[{skuPublico:'P-1',quantidade:2,preco:0.01}]}};
  await assert.rejects(lojaApi({...envio,totalCentavos:1}),e=>/aborted/.test(e.code));
  await assert.rejects(lojaApi({...envio,pedido:{...envio.pedido,itens:[{skuPublico:'OUTRA-LOJA',quantidade:1}]}}),e=>/invalid-argument/.test(e.code));
  const responses=await Promise.all([lojaApi(envio),lojaApi(envio)]);const receipt=responses[0].data;
  assert.equal(receipt.id,responses[1].data.id);assert.equal(receipt.totalCentavos,1980);assert.equal(receipt.estoqueReservado,false);assert.match(receipt.whatsappUrl,/^https:\/\/wa.me\/5567999991234/);
  assert.equal((await adb.collection(`lojas/${a.uid}/commerce_pedidos`).get()).size,1);
  const consulta={action:'consultarPedido',idPublico:published.idPublico,chaveEnvio:envio.chaveEnvio};
  const recuperado=(await lojaApi(consulta)).data;
  assert.equal(recuperado.encontrado,true);assert.equal(recuperado.pedido.id,receipt.id);
  assert.ok(!JSON.stringify(recuperado).includes('Comprador Teste'));
  assert.equal((await lojaApi({...consulta,chaveEnvio:crypto.randomUUID()})).data.encontrado,false);
  // Outro comprador não recupera o envio, mesmo conhecendo a chave.
  assert.equal((await httpsCallable(b.fns,'commerceLoja')(consulta)).data.encontrado,false);

  assert.equal((await opRef.get()).data().produtos[0].estoque,2);
  await forbid(getDoc(doc(buyer.db,'lojas',a.uid,'commerce_pedidos',receipt.id)));
  await forbid(setDoc(doc(a.db,'lojas',a.uid,'commerce_pedidos',receipt.id),{totalCentavos:1}));
  await forbid(setDoc(doc(a.db,'lojas',a.uid,'commerce_quotas','forjada'),{total:0}));
  await assert.rejects(adminB({action:'atualizarStatus',id:receipt.id,status:'em_atendimento'}),e=>/not-found/.test(e.code));
  assert.equal((await adminA({action:'resumoPedidos'})).data.novos,1);
  assert.equal((await adminB({action:'resumoPedidos'})).data.novos,0);
  const list=(await adminA({action:'listarPedidos'})).data;assert.equal(list.pedidos.length,1);assert.equal(list.pedidos[0].cliente.nome,'Comprador Teste');
  await adminA({action:'atualizarStatus',id:receipt.id,status:'em_atendimento'});
  assert.equal((await adminA({action:'resumoPedidos'})).data.novos,0);

  await adminA({action:'atualizarStatus',id:receipt.id,status:'encerrado'});
  await assert.rejects(adminA({action:'atualizarStatus',id:receipt.id,status:'cancelado'}),e=>/failed-precondition/.test(e.code));
  await adb.doc(`lojas/${a.uid}/commerce_private/licenca`).update({bloqueado:true});
  await forbid(lojaApi({action:'catalogo',idPublico:published.idPublico}));
  await adb.doc(`lojas/${a.uid}/commerce_private/licenca`).update({bloqueado:false});
  await adminA({action:'despublicar'});
  assert.equal((await lojaApi(consulta)).data.pedido.id,receipt.id); // confirmação continua recuperável

  await assert.rejects(lojaApi({action:'catalogo',idPublico:published.idPublico}),e=>/not-found/.test(e.code));
  assert.equal((await adminA({action:'publicar',expectedRevision:4,whatsapp:'5567999991234'})).data.idPublico,published.idPublico);

  // V1 fica congelada; preço/estoque do Commerce devem vir da geração V2.
  const generation='ab'.repeat(12),checksum='fixture-checksum',root=`lojas/${a.uid}/v2_generations/${generation}`;
  const certificate={sourceChecksum:checksum,productionReady:true,v1WritersFenced:true,finalReconciliationPassed:true,pdvIntegrationPassed:true,rollbackPrepared:true};
  const control={mode:'v2',generation,sourceChecksum:checksum,certificate};
  await adb.doc(root).set({schema:2,state:'ready',sourceChecksum:checksum,sequence:0,fieldManifest:{produtos:{kind:'array',collection:'produtos',count:1}},fieldCounts:{produtos:1}});
  await adb.doc(root+'/produtos/P-1').set({legacyField:'produtos',data:{...operacao.produtos[0],preco1BRL:12.34,estoque:3},deleted:false});
  await adb.doc(`lojas/${a.uid}/dados/storage_control`).set(control);
  assert.equal((await lojaApi({action:'catalogo',idPublico:published.idPublico})).data.catalogo[0].precoCentavos,1234);
  assert.equal((await adminA({action:'consultarLoja'})).data.produtos[0].estoque,3);
  const pubV2=(await adb.doc(`lojas/${a.uid}/commerce_private/publicacao`).get()).data();
  const pedidoV2=(await lojaApi({...envio,revision:pubV2.revision,chaveEnvio:crypto.randomUUID(),totalCentavos:2468})).data;
  assert.equal(pedidoV2.totalCentavos,2468);
  assert.equal((await opRef.get()).data().produtos[0].preco1BRL,9.9);
  assert.equal((await adb.doc(root+'/produtos/P-1').get()).data().data.estoque,3);
  await adb.doc(`lojas/${a.uid}/dados/storage_control`).set({...control,mode:'maintenance'});
  await assert.rejects(lojaApi({action:'catalogo',idPublico:published.idPublico}),e=>/failed-precondition/.test(e.code));
  console.log('PASSOU: Commerce leu preço/estoque V2 certificado, pedido canônico sem baixar estoque e manutenção bloqueada sem fallback V1.');
  console.log('HML_PUBLIC_ID='+published.idPublico);
  console.log('PASSOU: publicação licenciada, catálogo público allowlist, pedido canônico idempotente, WhatsApp, fila administrativa, suspensão, despublicação e dados operacionais preservados.');
  console.log('PASSOU: upload/miniatura privados, retry, persistência, foto cadastro, URLs com prazo e rejeição cruzada. IAM/expiração GCS real não simulados.');
 }
 console.log('PASSOU: autorização individual, papel de operador negado, revogação imediata e autoautorização bloqueada.');
 console.log('PASSOU: lojas A/B isoladas, Store privado, Storage negado e callable com revisao.');
}finally{for(const app of apps)await deleteApp(app);}

await import('./commerce-pdv-emulator-check.mjs');
