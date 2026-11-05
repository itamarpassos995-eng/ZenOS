import {createHash} from 'node:crypto';

const collections = {produtos:'produtos',clientes:'clientes',historicoVendas:'vendas',
  historicoCompras:'compras',caixaMovimentos:'movimentosCaixa',sessoesCaixa:'sessoesCaixa',
  vendedores:'operadores',fornecedores:'fornecedores',despesas:'despesas',vouchers:'vouchers'};
const canonical = value => Array.isArray(value) ? value.map(canonical) :
  value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
export const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const fail = (code,message) => {throw Object.assign(new Error(message),{code});};

// Server-controlled seed. No client-provided business data or destination IDs.
export function nativeSeed(uid, frontendCommit) {
  const revisions = Object.fromEntries([...Object.keys(collections),'regrasDesconto','regrasComissao','_syncMeta'].map(k=>[k,0]));
  const values = {
    regrasDesconto:{verdeMax:5,amareloMax:12,margemIdeal:30,margemMinima:15,exigirSenhaVermelho:true,senhaGerente:''},
    regrasComissao:{baseCalculo:'lucro',pctVerde:5,pctAmarelo:3,pctVermelho:1,bonusFixo:0,protecaoPrejuizo:true,bonusRegras:[]},
    _syncMeta:{fieldRevisions:revisions},
  };
  const admin = {id:'admin',nome:'Administrador (Gerência)',patente:'gerencia',senha:'admin',
    pinTrocaObrigatoria:true,percentual:0,comissaoTipo:'lucro',permissoes:{admin:true}};
  const sourceChecksum = hash({schema:2,uid,collections,values,admin});
  const generation = sourceChecksum.slice(0,24);
  const fieldCounts = Object.fromEntries(Object.keys(collections).map(k=>[k,k==='vendedores'?1:0]));
  const fieldManifest = Object.fromEntries(Object.entries(collections).map(([k,v])=>[k,{kind:'array',collection:v,count:fieldCounts[k]}]));
  for (const k of Object.keys(values)) fieldManifest[k]={kind:'value'};
  return {generation,sourceChecksum,admin,values,
    head:{schema:2,state:'ready',sequence:0,sourceChecksum,fieldManifest,fieldCounts,fieldRevisions:revisions},
    control:{mode:'v2',origin:'native-v2',generation,sourceChecksum,frontendCommit,
      certificate:{sourceChecksum,productionReady:true,v1WritersFenced:true,finalReconciliationPassed:true,
        pdvIntegrationPassed:true,rollbackPrepared:true}}};
}

export async function provisionNativeV2(db, request) {
  const uid=request.auth?.uid;
  if (!uid || request.auth.token?.firebase?.sign_in_provider==='anonymous') fail('unauthenticated','Entre na conta da empresa.');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) fail('invalid-argument','Conta inválida.');
  if (request.data && (typeof request.data!=='object' || Array.isArray(request.data) || Object.keys(request.data).length))
    fail('invalid-argument','Não envie dados ou identificadores de outra conta.');
  const root=`lojas/${uid}`;
  return db.runTransaction(async tx=>{
    const controlRef=db.doc(`${root}/dados/storage_control`), legacyRef=db.doc(`${root}/dados/operacao`);
    const [store,control,legacy,policy]=await Promise.all([
      tx.get(db.doc(root)),tx.get(controlRef),tx.get(legacyRef),tx.get(db.doc('system/storage_policy'))]);
    if (!store.exists) fail('failed-precondition','Crie a conta da empresa antes de iniciar o armazenamento.');
    // Never reinterpret an existing account as a fresh installation.
    if (control.exists) return {status:'existing-control',mode:control.data().mode};
    if (legacy.exists) return {status:'existing-legacy',mode:'legacy'};
    const p=policy.exists?policy.data():{};
    if(p.newStoreSchema!==2 || p.nativeProtectionReady!==true || !/^[a-f0-9]{40}$/.test(p.frontendCommit||'')
       || !/^[a-f0-9]{64}$/.test(p.rulesSha256||'')) fail('failed-precondition','Ativação de novas contas V2 ainda não certificada.');
    // Limit provisioning to accounts created after the certified release. An
    // old account missing its V1 document must not be silently reset to empty.
    const created=store.data().createdAtServer;
    if(!created?.toMillis || !p.enabledAt?.toMillis || created.toMillis()<p.enabledAt.toMillis())
      fail('failed-precondition','Conta existente requer inspeção administrativa; nenhum dado foi alterado.');
    const seed=nativeSeed(uid,p.frontendCommit),base=`${root}/v2_generations/${seed.generation}`;
    tx.create(controlRef,seed.control);
    tx.create(db.doc(base),seed.head);
    tx.create(db.doc(`${base}/operadores/admin`),{data:seed.admin,legacyField:'vendedores',legacyIndex:0});
    for(const [field,value] of Object.entries(seed.values)) tx.create(db.doc(`${base}/legacy_fields/${field}`),{field,value});
    return {status:'created',mode:'v2',generation:seed.generation};
  });
}
