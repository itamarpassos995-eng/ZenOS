import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';
import { coletarBackupLoja, restaurarBackupSomenteHomologacao } from '../src/core/backupRecovery.js';
import { validarBackup } from '../src/core/backupCore.js';
import { atualizarMesaV1, garantirMesasV1 } from '../src/core/tablesV1.js';

const projectId='demo-zenos-local';
const config={apiKey:'demo-key',authDomain:'demo-zenos-local.firebaseapp.com',projectId};
const stamp=Date.now();
const email=`att09-${stamp}@teste.local`;
const senha='TesteZenOS!8427';
let ok=0;
const check=async(nome,fn)=>{await fn();ok++;console.log(`[OK] ${nome}`);};

const appA=initializeApp(config,`att09-a-${stamp}`);
const appB=initializeApp(config,`att09-b-${stamp}`);
const authA=getAuth(appA); const authB=getAuth(appB);
connectAuthEmulator(authA,'http://127.0.0.1:9099',{disableWarnings:true});
connectAuthEmulator(authB,'http://127.0.0.1:9099',{disableWarnings:true});
const dbA=getFirestore(appA); const dbB=getFirestore(appB);
connectFirestoreEmulator(dbA,'127.0.0.1',8080);
connectFirestoreEmulator(dbB,'127.0.0.1',8080);

try {
  const cred=await createUserWithEmailAndPassword(authA,email,senha);
  await signInWithEmailAndPassword(authB,email,senha);
  const uid=cred.user.uid;
  const origem=`${uid}-backup-origem`;
  const destino=`${uid}-backup-destino`;

  await check('Backup/restauração real no Emulator preserva entidades e conteúdo', async()=>{
    const produtos=Array.from({length:25},(_,i)=>({id:`P-${i+1}`,sku:`SKU-${i+1}`,nome:`Produto ${i+1}`,estoque:i+3,estoqueVitrine:1,estoqueGalpao:i+2,precoBRL:20+i,custoBRL:10+i,localizacao:`A-${i%5}`}));
    const clientes=Array.from({length:12},(_,i)=>({id:`C-${i+1}`,nome:`Cliente ${i+1}`,saldoDevedorBRL:i===0?50:0}));
    const vendas=Array.from({length:30},(_,i)=>({id:`V-${i+1}`,createdAt:`2026-10-${String((i%28)+1).padStart(2,'0')}T12:00:00.000Z`,totalBRL:100+i,estado:'concluida',itens:[{produtoOriginalId:`P-${(i%25)+1}`,qtd:1}]}));
    await setDoc(doc(dbA,'lojas',origem),{nome:'Loja Origem ATT09'});
    await setDoc(doc(dbA,'lojas',origem,'dados','operacao'),{produtos,clientes,historicoVendas:vendas,fornecedores:[],historicoCompras:[],despesas:[],caixaMovimentos:[],sessoesCaixa:[],vouchers:[],vendedores:[]});
    await setDoc(doc(dbA,'lojas',origem,'dados','configuracoes'),{perfilLoja:{nomeFantasia:'Loja Origem ATT09'}});
    await setDoc(doc(dbA,'lojas',origem,'dados','mesas'),{schema:'MESAS_V1_ATT09',mesas:[]});
    await setDoc(doc(dbA,'lojas',origem,'financeiro_livro','L-1'),{tipo:'entrada',valor:100,createdAt:'2026-10-07T00:00:00.000Z'});
    await setDoc(doc(dbA,'lojas',origem,'produto_indices','sku-SKU-1'),{produtoId:'P-1',sku:'SKU-1'});

    const backup=await coletarBackupLoja({db:dbA,userId:origem,operadorNome:'Teste ATT09'});
    const val=await validarBackup(backup);
    assert.equal(val.ok,true);
    assert.equal(val.counts.produtos,25);
    assert.equal(val.counts.clientes,12);
    assert.equal(val.counts.vendas,30);
    const r=await restaurarBackupSomenteHomologacao({db:dbA,userId:destino,backup});
    assert.equal(r.ok,true);
    const op=await getDoc(doc(dbA,'lojas',destino,'dados','operacao'));
    assert.equal(op.exists(),true);
    assert.deepEqual(op.data().produtos.map(p=>p.id),produtos.map(p=>p.id));
    assert.equal(op.data().clientes.length,12);
    assert.equal(op.data().historicoVendas.length,30);
    const fin=await getDocs(collection(dbA,'lojas',destino,'financeiro_livro'));
    assert.equal(fin.size,1);
  });

  await check('Dois terminais recebem Mesas em realtime sem F5', async()=>{
    const loja=`${uid}-mesas-realtime`;
    await garantirMesasV1({db:dbA,userId:loja});
    let recebido=null;
    const pronto=new Promise((resolve,reject)=>{
      const t=setTimeout(()=>reject(new Error('Timeout aguardando realtime.')),5000);
      const unsub=onSnapshot(doc(dbB,'lojas',loja,'dados','mesas'),snap=>{
        const m=snap.data()?.mesas?.find(x=>x.id==='M1');
        if(m?.itens?.some(i=>i.produtoId==='P-X')){recebido=m;clearTimeout(t);unsub();resolve();}
      },reject);
    });
    await atualizarMesaV1({db:dbA,userId:loja,mesaId:'M1',operador:{id:'opA',nome:'Terminal A'},mutator:m=>({...m,status:'ocupada',itens:[...(m.itens||[]),{produtoId:'P-X',nome:'Teste',qtd:1,preco:10,custo:5}]})});
    await pronto;
    assert.equal(recebido?.itens?.length,1);
  });

  await check('Concorrência em mesas preserva alterações de dois terminais via transaction', async()=>{
    const loja=`${uid}-mesas-concorrencia`;
    await garantirMesasV1({db:dbA,userId:loja});
    await Promise.all([
      atualizarMesaV1({db:dbA,userId:loja,mesaId:'M1',operador:{id:'A',nome:'A'},mutator:m=>({...m,status:'ocupada',itens:[...(m.itens||[]),{produtoId:'A',nome:'A',qtd:1,preco:10,custo:5}]})}),
      atualizarMesaV1({db:dbB,userId:loja,mesaId:'M2',operador:{id:'B',nome:'B'},mutator:m=>({...m,status:'ocupada',itens:[...(m.itens||[]),{produtoId:'B',nome:'B',qtd:1,preco:20,custo:8}]})}),
    ]);
    const snap=await getDoc(doc(dbA,'lojas',loja,'dados','mesas'));
    assert.equal(snap.data().mesas.find(m=>m.id==='M1').itens.some(i=>i.produtoId==='A'),true);
    assert.equal(snap.data().mesas.find(m=>m.id==='M2').itens.some(i=>i.produtoId==='B'),true);
  });

  console.log(`\nATT 09 Emulator: ${ok}/${ok} verificações aprovadas.`);
} finally {
  await Promise.allSettled([deleteApp(appA),deleteApp(appB)]);
}
