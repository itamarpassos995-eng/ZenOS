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
