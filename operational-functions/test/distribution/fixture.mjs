import {initializeApp,getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import logoData from './logo-snapshot.mjs';
import {pbkdf2Sync} from 'node:crypto';
import {nativeSeed} from '../../src/nativeV2.js';
import {requireEmulators,id} from '../../src/distribution/security.js';
requireEmulators();
const app=getApps().find(a=>a.name==='distribution-fixture')||initializeApp({projectId:'demo-zenos-local'},'distribution-fixture');
export const db=getFirestore(app),adminAuth=getAuth(app);
export const PIN='482759';
export const PASSWORD='SyntheticOnly!482759';
export async function seed(uid='distribution-demo',{stock=100,orders=5}={}) {
 if(!uid.startsWith('distribution-'))throw Error('Synthetic fixture IDs only');
 const email=`${uid}@example.test`;
 try{await adminAuth.createUser({uid,email,password:PASSWORD});}catch(e){if(e.code!=='auth/uid-already-exists'&&e.code!=='auth/email-already-exists')throw e;}
 const original=nativeSeed(uid,'a'.repeat(40)),generation=original.generation,root=`lojas/${id(uid)}`,base=`${root}/v2_generations/${generation}`;
 const salt='abcdef0123456789abcdef0123456789';
 const operator={...original.admin,nome:'Administrador sintético',senha:null,pinTrocaObrigatoria:false,pinSalt:salt,pinVersion:2,pinHash:pbkdf2Sync(PIN,Buffer.from(salt,'hex'),120000,32,'sha256').toString('hex')};
 const batch=db.batch();
 batch.set(db.doc(root),{nomeLoja:'Distribuidora de homologação',synthetic:true});
 batch.set(db.doc(`${root}/dados/storage_control`),{...original.control,entitlements:{distribution:{enabled:true,expiresAt:null}}});
 const head=structuredClone(original.head);head.fieldCounts.sessoesCaixa=1;head.fieldManifest.sessoesCaixa.count=1;
 for(const [field,count] of [['produtos',1],['clientes',1],['vendedores',3],['historicoVendas',orders]]){head.fieldCounts[field]=count;head.fieldManifest[field].count=count;}
 batch.set(db.doc(base),head);
 for(const [field,value] of Object.entries(original.values))batch.set(db.doc(`${base}/legacy_fields/${id(field)}`),{field,value});
 const envelope=(data,field,index=0)=>({data,legacyField:field,legacyIndex:index,version:0,deleted:false});
 batch.set(db.doc(`${base}/operadores/admin`),envelope(operator,'vendedores'));
 batch.set(db.doc(`${base}/operadores/stock`),envelope({...operator,id:'stock',nome:'Estoque sintético',patente:'vendedor',permissoes:{produtos:true}},'vendedores',1));
 batch.set(db.doc(`${base}/operadores/sales`),envelope({...operator,id:'sales',nome:'Vendedor sintético',patente:'vendedor',permissoes:{pdv:true,vendas:true}},'vendedores',2));
 batch.set(db.doc(`${base}/sessoesCaixa/CASH1`),envelope({id:'CASH1',operadorId:'admin',status:'aberta'},'sessoesCaixa'));
 batch.set(db.doc(`${base}/clientes/C1`),envelope({id:'C1',nome:'Mercado Boa Colheita (teste)',endereco:'Av. de Homologação, 120 · Centro',saldoDevedorBRL:0,limiteCreditoBRL:500},'clientes'));
 batch.set(db.doc(`${base}/produtos/P1`),envelope({id:'P1',sku:'SINT-001',nome:'Tinta acrílica 18 L (teste)',unidadeMedida:'UN',estoque:stock,estoqueVitrine:0,estoqueGalpao:stock,estoqueReservadoDistribuicao:0,valoresMonetarios:{versao:1,campos:{precoVenda:{valor:39990,moeda:'PYG'},custo:{valor:12,moeda:'BRL'}}}},'produtos'));
 for(let i=1;i<=orders;i++)batch.set(db.doc(`${base}/vendas/O${String(i).padStart(3,'0')}`),envelope({id:`O${String(i).padStart(3,'0')}`,tipoDocumento:'pre_pedido',estado:'pendente',createdAt:new Date().toISOString(),vendedorId:i%2?'sales':'admin',vendedorNome:i%2?'Vendedor sintético':'Administrador sintético',clienteId:'C1',clienteNome:'Mercado Boa Colheita (teste)',moedaDocumento:'PYG',totalOriginal:199950,totalBRL:150,taxasCambio:{BRL:1,PYG:1333,USD:0.2,EUR:0.17},itens:[{id:'P1',sku:'SINT-001',nome:'Tinta acrílica 18 L (teste)',qtd:5,precoPraticadoBRL:30,totalBRL:150}],pagamentos:[]},'historicoVendas',i-1));
 batch.set(db.doc(`${root}/distribution_config/module`),{enabled:true,timezone:'America/Asuncion',issuer:{name:'Distribuidora de Homologação',taxId:'SINTÉTICO - SEM VALOR FISCAL',logoData}});
 await batch.commit();return {uid,email,base,root,generation};
}
if(process.argv[1]?.endsWith('/fixture.mjs')) {const f=await seed();console.log(JSON.stringify({url:'http://127.0.0.1:5173/distribution-homologacao.html',email:f.email,password:PASSWORD,operatorId:'admin',pin:PIN}));process.exit(0);}
