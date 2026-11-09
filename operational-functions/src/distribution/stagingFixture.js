import {pbkdf2Sync,randomBytes} from 'node:crypto';
import {nativeSeed} from '../nativeV2.js';
import {error,id} from './security.js';

export async function provisionStagingFixture(db,uid,{pin,driverPin,commit}){
 if(db.projectId!=='zenos-distribution-staging'||!/^\d{8,12}$/.test(pin||'')||
    !/^\d{8,12}$/.test(driverPin||'')||pin===driverPin||!(/^[a-f0-9]{40}$/.test(commit||'')))error('STAGING_FIXTURE_CONFIGURATION_REQUIRED');
 const root=`lojas/${id(uid)}`;
 const {control,head,generation,admin,values}=nativeSeed(uid,commit);
 const base=`${root}/v2_generations/${generation}`;
 const write=(tx,path,data)=>tx.create(db.doc(path),data);
 const entity=(data,legacyField,legacyIndex)=>({data,legacyField,legacyIndex,version:0,deleted:false});
 const withPin=(operator,value)=>{
  const pinSalt=randomBytes(16).toString('hex');
  return {...operator,senha:null,pinVersion:2,pinTrocaObrigatoria:false,pinSalt,
   pinHash:pbkdf2Sync(value,Buffer.from(pinSalt,'hex'),120000,32,'sha256').toString('hex')};
 };
 return db.runTransaction(async tx=>{
  const [tenant,existing,legacy]=await Promise.all([tx.get(db.doc(root)),tx.get(db.doc(`${root}/dados/storage_control`)),tx.get(db.doc(`${root}/dados/operacao`))]);
  if(existing.exists&&tenant.data()?.synthetic===true)return;
  if(tenant.exists||existing.exists||legacy.exists)error('STAGING_FIXTURE_ALREADY_EXISTS');
  write(tx,root,{nomeLoja:'Distribuidora Paraguaya · Prueba',synthetic:true});
  write(tx,`${root}/dados/storage_control`,{...control,entitlements:{distribution:{enabled:true,expiresAt:null}}});
  for(const [field,count] of [['produtos',1],['clientes',3],['historicoVendas',3],['vendedores',2]]){
   head.fieldCounts[field]=count;head.fieldManifest[field].count=count;
  }
  write(tx,base,head);
  for(const [field,value] of Object.entries(values))write(tx,`${base}/legacy_fields/${id(field)}`,{field,value});
  write(tx,`${base}/operadores/admin`,entity(withPin(admin,pin),'vendedores',0));
  write(tx,`${base}/operadores/driver`,entity(withPin({id:'driver',nome:'Conductor de prueba',patente:'motorista',permissoes:{distributionDriver:true}},driverPin),'vendedores',1));
  write(tx,`${base}/produtos/P1`,entity({id:'P1',sku:'PY-001',nome:'Papel de prueba',unidadeMedida:'UN',estoque:30,estoqueGalpao:30,estoqueVitrine:0,estoqueReservadoDistribuicao:0,valoresMonetarios:{versao:1,campos:{precoVenda:{valor:39990,moeda:'PYG'}}}},'produtos',0));
  for(const [i,city] of ['Asunción','Luque','San Lorenzo'].entries()){
   const customerId=`C${i+1}`,orderId=`O00${i+1}`,name=`Cliente de prueba ${i+1}`;
   write(tx,`${base}/clientes/${customerId}`,entity({id:customerId,nome:name,cidade:city,endereco:city,saldoDevedorBRL:0},'clientes',i));
   write(tx,`${base}/vendas/${orderId}`,entity({id:orderId,tipoDocumento:'pre_pedido',estado:'pendente',createdAt:new Date().toISOString(),clienteId:customerId,clienteNome:name,vendedorId:'admin',moedaDocumento:'PYG',totalOriginal:199950,totalBRL:150,itens:[{id:'P1',sku:'PY-001',nome:'Papel de prueba',qtd:5,precoPraticadoBRL:30,totalBRL:150,custoNaVendaBRL:12}],pagamentos:[]},'historicoVendas',i));
  }
  write(tx,`${root}/distribution_config/module`,{enabled:true,pilotProfile:'PYG_CREDIT_CASH_V1',timezone:'America/Asuncion',issuer:{name:'Distribuidora Paraguaya · Prueba',taxId:'SINTÉTICO · SIN VALOR FISCAL'}});
 });
}

export async function provisionStagingPygCashFixture(db,uid){
 if(db.projectId!=='zenos-distribution-staging')error('STAGING_FIXTURE_CONFIGURATION_REQUIRED');
 const root=`lojas/${id(uid)}`;
 return db.runTransaction(async tx=>{
  const tenant=await tx.get(db.doc(root));
  const control=(await tx.get(db.doc(`${root}/dados/storage_control`))).data();
  if(tenant.data()?.synthetic!==true||control?.mode!=='v2')error('STAGING_FIXTURE_CONFIGURATION_REQUIRED');
  const base=`${root}/v2_generations/${id(control.generation)}`;
  const headRef=db.doc(base),configRef=db.doc(`${root}/distribution_config/module`);
  const marker=db.doc(`${root}/distribution_staging_health/pyg-cash-fixture-v1`);
  const [head,config,prior]=await tx.getAll(headRef,configRef,marker);
  if(prior.exists)return;
  if(head.data()?.state!=='ready'||config.data()?.pilotProfile!=='PYG_CREDIT_CASH_V1'||config.data().nativePygCashEnabled)
   error('STAGING_FIXTURE_CONFIGURATION_REQUIRED');
  const orderId='PYG-CASH-V1',clientId='PYG-CASH-CLIENT',productId='PYG-CASH-PRODUCT';
  const nativeAmount={currency:'PYG',amountMinor:1000000,historicalRate:'1250'};
  const counts={...head.data().fieldCounts},manifest={...head.data().fieldManifest};
  const createEntity=(collection,data,field)=>{
   const index=counts[field]||0;
   tx.create(db.doc(`${base}/${collection}/${data.id}`),{data,legacyField:field,legacyIndex:index,version:head.data().sequence,deleted:false});
   counts[field]=index+1;
   manifest[field]={...manifest[field],count:index+1};
  };
  createEntity('clientes',{id:clientId,nome:'Cliente sintético · PYG',cidade:'Asunción',saldoDevedorBRL:800},'clientes');
  createEntity('produtos',{id:productId,sku:productId,nome:'Producto sintético · PYG',unidadeMedida:'UN',
   estoque:10,estoqueGalpao:10,estoqueVitrine:0,estoqueReservadoDistribuicao:0},'produtos');
  createEntity('vendas',{id:orderId,tipoDocumento:'venda',estado:'concluida',createdAt:new Date().toISOString(),
   clienteId:clientId,clienteNome:'Cliente sintético · PYG',vendedorId:'admin',moedaDocumento:'PYG',
   taxasCambio:{BRL:1,PYG:1250},totalOriginal:1000000,totalBRL:800,
   itens:[{id:productId,sku:productId,nome:'Producto sintético · PYG',qtd:5,precoPraticadoBRL:160,totalBRL:800,
    custoNaVendaBRL:12,movimentoEstoqueVenda:{total:5,galpao:5,vitrine:0}}],
   pagamentos:[{formaId:'crediario',moedaOrigem:'BRL',valorOriginal:800,valorConvertidoBRL:800}],
   financeCreditV2:{schema:1,receivableId:`REC-${orderId}`,originalBRL:800,nativeAmount,
    installments:[{id:'PYG-CASH-INSTALLMENT',amountBRL:800,nativeAmount}]},creditAllocationsV2:[]},'historicoVendas');
  createEntity('sessoesCaixa',{id:'PYG-CASH-SESSION',operadorId:'admin',status:'aberta'},'sessoesCaixa');
  tx.create(db.doc(`${root}/financeiro_livro/VENDA-${orderId}-FIADO`),{
   tipo:'venda_fiada',clienteId:clientId,valor:800,moeda:'BRL',_v2:{generation:control.generation},
   financeLink:{financeEventType:'OBLIGATION',saleId:orderId,receivableId:`REC-${orderId}`}});
  tx.update(headRef,{fieldCounts:counts,fieldManifest:manifest});
  tx.update(configRef,{nativePygCashEnabled:true,driverPaymentMethods:[{id:'dinheiro_pyg',currency:'PYG'}]});
  tx.create(marker,{orderId,synthetic:true});
 });
}
