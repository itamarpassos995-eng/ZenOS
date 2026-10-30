import {createHash} from 'node:crypto';
import {putPrivate,readPrivate,listPrivate,deletePrivate,privateStoreReady} from './_lib/privateBlobStore.js';
import {verifyOwnerFirebaseIdToken} from './_lib/commerceGoogle.js';
import {normalizarApelidoPublico,validarSnapshotPublico} from '../../src/core/commerceCdnClient.js';
import {conferirCarrinhoContraSnapshot} from '../../src/core/commercePublicCatalog.js';

// Separação rigorosa: este módulo nunca importa firebase/db e não consulta Firestore.
// Pedidos (PII) jamais entram no Blob público usado para o catálogo.
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{20,100}$/.test(v);
const onlyText=(v,max=150)=>String(v??'').trim().slice(0,max);
const validUid=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
const active=()=>process.env.ZENOS_COMMERCE_PRIVATE_INBOX_ENABLED==='true'&&
  process.env.ZENOS_COMMERCE_INBOX_WAF_READY==='true'&&privateStoreReady();

async function publicCatalog(slug){
  const base=process.env.ZENOS_COMMERCE_CDN_ORIGIN;
  let origin;
  try{
    origin=new URL(base);
    if(origin.protocol!=='https:'||!origin.hostname.endsWith('.public.blob.vercel-storage.com')||
      origin.username||origin.password||origin.port||origin.pathname!=='/'||origin.search||origin.hash)throw Error('origem-invalida');
  }catch{throw Error('catalogo-indisponivel');}
  const load=async path=>{
    const r=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(6000)});
    if(!r.ok)throw Error('catalogo-indisponivel');
    const body=await r.text();
    if(body.length>2_000_000)throw Error('catalogo-grande-demais');
    return JSON.parse(body);
  };
  const manifest=await load('commerce/catalogos/'+slug+'.json');
  const checked=validarSnapshotPublico(manifest,slug);
  if(checked.versao===1)return {lojaId:checked.idPublico,config:checked.configCommerce,produtos:checked.produtos};
  const todos=[],custom={};
  for(let start=1;start<=checked.totalPaginas;start+=6){
    const pages=await Promise.all(Array.from({length:Math.min(6,checked.totalPaginas-start+1)},(_,i)=>{
      const page=start+i;
      return load('commerce/catalogos/'+slug+'/versoes/'+checked.publicacaoId+'/pagina-'+page+'.json')
        .then(data=>({data,page}));
    }));
    for(const {data,page} of pages){
      if(data.versao!==2||data.slug!==slug||data.pagina!==page||
        data.lojaId!==checked.idPublico||data.publicacaoId!==checked.publicacaoId||
        !Array.isArray(data.produtos)||data.produtos.length>80)throw Error('catalogo-inconsistente');
      todos.push(...data.produtos);Object.assign(custom,data.produtosLoja||{});
    }
  }
  if(todos.length!==checked.totalProdutos)throw Error('catalogo-incompleto');
  return {lojaId:checked.idPublico,
    config:{...checked.configCommerce,produtosLoja:custom},produtos:todos,versao:1};
}
function parseOrder(body){
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('pedido-invalido');
  const slug=normalizarApelidoPublico(body.slug);
  if(!validId(body.requestId))throw Error('pedido-id-invalido');
  const nome=onlyText(body.cliente?.nome,100);
  const telefone=String(body.cliente?.telefone||'').replace(/\D/g,'').slice(0,18);
  if(nome.length<2||telefone.length<8||telefone.length>15)throw Error('cliente-invalido');
  const tipo=body.entrega?.tipo;
  if(!['entrega','retirada'].includes(tipo))throw Error('entrega-invalida');
  const endereco=tipo==='entrega'?{
    rua:onlyText(body.entrega?.rua),numero:onlyText(body.entrega?.numero,30),
    bairro:onlyText(body.entrega?.bairro,90),complemento:onlyText(body.entrega?.complemento,160),
    cidade:onlyText(body.entrega?.cidade,90)
  }:null;
  if(endereco&&(!endereco.rua||!endereco.numero||!endereco.bairro))throw Error('endereco-invalido');
  const forma=body.pagamento?.forma;
  if(!['pix','cartao','dinheiro'].includes(forma))throw Error('pagamento-invalido');
  const itens=body.itens;
  if(!Array.isArray(itens)||!itens.length||itens.length>30)throw Error('itens-invalidos');
  return {slug,requestId:body.requestId,
    cliente:{nome,telefone,observacao:onlyText(body.cliente?.observacao,600)},
    entrega:{tipo,endereco},
    pagamento:{forma,trocoPara:forma==='dinheiro'?onlyText(body.pagamento?.trocoPara,35):''},
    itens:itens.map(item=>({id:onlyText(item?.id,128),quantidade:Number(item?.quantidade)}))};
}
export async function submitOrder(body,{catalog=publicCatalog,write=putPrivate,
  read=readPrivate,now=()=>new Date()}={}){
  const p=parseOrder(body);
  const payloadHash=createHash('sha256').update(JSON.stringify(p)).digest('hex');
  const shop=await catalog(p.slug);
  if(!validUid(shop.lojaId))throw Error('loja-invalida');
  if(shop.config?.habilitado===false)throw Error('loja-indisponivel');
  if(p.entrega.tipo==='entrega'&&shop.config?.aceitaEntrega===false)throw Error('entrega-nao-disponivel');
  if(p.entrega.tipo==='retirada'&&shop.config?.aceitaRetirada===false)throw Error('retirada-nao-disponivel');
  const calc=conferirCarrinhoContraSnapshot({...shop,versao:1},p.itens);
  const names=new Map(shop.produtos.map(item=>[String(item.id),item.nome]));
  const id='ON-'+createHash('sha256').update(shop.lojaId+':'+p.requestId).digest('hex').slice(0,24).toUpperCase();
  const pedido={id,criadoEm:now().toISOString(),origem:'commerce-cdn-privado',estado:'pendente',
    idempotencyHash:payloadHash,
    clienteNome:p.cliente.nome,clienteTelefone:p.cliente.telefone,observacao:p.cliente.observacao,
    tipoEntrega:p.entrega.tipo,endereco:p.entrega.endereco,
    formaPagamento:p.pagamento.forma,trocoPara:p.pagamento.trocoPara,
    totalBRL:calc.totalCentavos/100,totalCentavos:calc.totalCentavos,
    itens:calc.itens.map((item,i)=>({id:id+'-'+i,produtoId:item.id,sku:item.id,
      nome:shop.config.produtosLoja?.[item.id]?.nomeLoja||names.get(item.id),
      quantidade:item.quantidade,qtd:String(item.quantidade),
      precoUnitarioBRL:item.precoUnitarioCentavos/100,
      precoPraticadoBRL:item.precoUnitarioCentavos/100,
      precoTexto:(item.precoUnitarioCentavos/100).toFixed(2),
      subtotalBRL:item.subtotalCentavos/100}))};
  const path='commerce/pedidos/'+shop.lojaId+'/pendentes/'+id+'.json';
  try {
    await write(path,pedido);
  } catch(error) {
    if(error?.message!=='pedido-ja-registrado')throw error;
    // Falha de rede após gravação: a repetição com mesmo conteúdo recebe o
    // mesmo protocolo, sem criar uma segunda solicitação.
    const existing=await read(path);
    if(existing?.id!==id||existing.idempotencyHash!==payloadHash)
      throw Error('chave-pedido-reutilizada');
    return {id,totalCentavos:existing.totalCentavos,duplicado:true};
  }
  return {id,totalCentavos:calc.totalCentavos,duplicado:false};
}
const respond=(res,status,data)=>{res.setHeader('Cache-Control','no-store');return res.status(status).json(data);};
const forbidden=(body)=>JSON.stringify(body||{}).length>12_000;
export function createPrivateInboxHandler({verify=verifyOwnerFirebaseIdToken,submit=submitOrder,
  get=readPrivate,list=listPrivate,put=putPrivate,remove=deletePrivate}={}){
  return async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    if(!active())return respond(res,503,{erro:'integracao-em-preparacao'});
    if(req.method==='POST'){
      if(forbidden(req.body))return respond(res,413,{erro:'pedido-grande-demais'});
      try{
        const result=await submit(req.body);
        return respond(res,201,{status:'registrado',...result});
      }catch(err){
        const message=String(err.message||'');
        if(message==='chave-pedido-reutilizada')return respond(res,409,{erro:'pedido-conflitante'});
        if(/invalido|invalidos|nao-disponivel|estoque|quantidade|inativa|produto|preco|duplicado/.test(message))
          return respond(res,422,{erro:'pedido-ou-estoque-invalido'});
        return respond(res,503,{erro:'pedido-nao-confirmado'});
      }
    }
    if(!['GET','PATCH'].includes(req.method))return respond(res,405,{erro:'metodo-nao-permitido'});
    const header=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(req.headers?.authorization||'');
    if(!header)return respond(res,401,{erro:'login-necessario'});
    let uid;
    try{uid=(await verify(header[1])).uid;}catch{return respond(res,401,{erro:'login-invalido'});}
    if(!validUid(uid))return respond(res,401,{erro:'login-invalido'});
    const id=req.query?.id;
    if(req.method==='GET'&&!id){
      try{
        const cursor=typeof req.query?.cursor==='string'&&req.query.cursor.length<1024
          ?req.query.cursor:undefined;
        const data=await list(uid,cursor);
        const pedidos=(data.blobs||[]).filter(b=>b.pathname?.startsWith('commerce/pedidos/'+uid+'/pendentes/'))
          .map(b=>({id:b.pathname.split('/').at(-1).replace(/\.json$/,''),criadoEm:b.uploadedAt}));
        return respond(res,200,{pedidos,hasMore:!!data.hasMore,cursor:data.cursor||null});
      }catch{return respond(res,503,{erro:'fila-indisponivel'});}
    }
    if(!/^ON-[A-F0-9]{24}$/.test(id||''))return respond(res,400,{erro:'id-invalido'});
    const path='commerce/pedidos/'+uid+'/pendentes/'+id+'.json';
    try{
      const data=await get(path);
      if(!data||data.id!==id)return respond(res,404,{erro:'pedido-nao-encontrado'});
      if(req.method==='GET')return respond(res,200,{pedido:data});
      if(req.body?.acao!=='arquivar')return respond(res,400,{erro:'acao-invalida'});
      await put('commerce/pedidos/'+uid+'/arquivados/'+id+'.json',
        {...data,estado:'arquivado',arquivadoEm:new Date().toISOString()},
        {overwrite:true});
      // Só remove o pendente DEPOIS de arquivar.
      await remove(path);
      return respond(res,200,{status:'arquivado',id});
    }catch{return respond(res,503,{erro:'fila-indisponivel'});}
  };
}
export default createPrivateInboxHandler();