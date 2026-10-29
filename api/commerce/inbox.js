import {randomUUID,createHash} from 'node:crypto';
import {verifyOwnerFirebaseIdToken} from './_lib/commerceGoogle.js';
import {normalizarApelidoPublico,validarSnapshotPublico} from '../../src/core/commerceCdnClient.js';
import {conferirCarrinhoContraSnapshot} from '../../src/core/commercePublicCatalog.js';

// Separação rigorosa: este módulo nunca importa firebase/db e não consulta Firestore.
// Pedidos (PII) jamais entram no Blob público usado para o catálogo.
const STORE_ID='Ub5FhVPSfclqNq5p';
const API='https://vercel.com/api/blob';
const PRIVATE_ORIGIN='https://'+STORE_ID+'.private.blob.vercel-storage.com';
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{20,100}$/.test(v);
const onlyText=(v,max=150)=>String(v??'').trim().slice(0,max);
const validUid=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
const active=()=>process.env.ZENOS_COMMERCE_PRIVATE_INBOX_ENABLED==='true'&&
  typeof process.env.ZENOS_COMMERCE_PRIVATE_BLOB_TOKEN==='string'&&
  process.env.ZENOS_COMMERCE_PRIVATE_BLOB_TOKEN.startsWith('vercel_blob_rw_')&&
  process.env.ZENOS_COMMERCE_INBOX_WAF_READY==='true';

function headers(extra={}){
  const token=process.env.ZENOS_COMMERCE_PRIVATE_BLOB_TOKEN;
  if(!active())throw Error('fila-nao-configurada');
  return {
    Authorization:'Bearer '+token,'x-api-version':'13',
    'x-vercel-blob-store-id':STORE_ID,
    'x-api-blob-request-id':STORE_ID+':'+Date.now()+':'+randomUUID(),
    'x-api-blob-request-attempt':'0',
    ...extra
  };
}
async function apiFetch(path,{method='GET',body,extra={}}={}){
  const res=await fetch(API+path,{method,headers:headers(extra),body,signal:AbortSignal.timeout(10000)});
  if(!res.ok){const err=Error('fila-armazenamento-indisponivel');err.status=res.status;throw err;}
  if(res.status===204)return {};
  const raw=await res.text();
  return raw?JSON.parse(raw):{};
}
async function privatePut(path,content,{overwrite=false}={}){
  const res=await fetch(API+'/?pathname='+encodeURIComponent(path),{
    method:'PUT',headers:headers({'x-vercel-blob-access':'private',
      'x-add-random-suffix':'0','x-allow-overwrite':overwrite?'1':'0',
      'x-content-type':'application/json','x-cache-control-max-age':'60'}),
    body:JSON.stringify(content),signal:AbortSignal.timeout(10000)
  });
  if(res.status===409||res.status===412){const err=Error('pedido-ja-registrado');err.status=409;throw err;}
  if(!res.ok)throw Error('fila-gravacao-indisponivel');
  const data=await res.json();
  if(!String(data.url||'').startsWith(PRIVATE_ORIGIN+'/'))throw Error('blob-privacidade-invalida');
  return data;
}
async function privateRead(path){
  const res=await fetch(PRIVATE_ORIGIN+'/'+path,{headers:{Authorization:headers().Authorization},
    cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(res.status===404)return null;
  if(!res.ok)throw Error('fila-leitura-indisponivel');
  const size=Number(res.headers.get('content-length')||0);
  if(size>80_000)throw Error('pedido-grande-demais');
  const raw=await res.text();
  if(raw.length>80_000)throw Error('pedido-grande-demais');
  return JSON.parse(raw);
}
async function pending(uid,cursor){
  const q=new URLSearchParams({prefix:'commerce/pedidos/'+uid+'/pendentes/',limit:'80'});
  if(cursor)q.set('cursor',cursor);
  return apiFetch('?'+q.toString());
}
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
export async function submitOrder(body,{catalog=publicCatalog,write=privatePut,now=()=>new Date()}={}){
  const p=parseOrder(body);
  const shop=await catalog(p.slug);
  if(!validUid(shop.lojaId))throw Error('loja-invalida');
  if(shop.config?.habilitado===false)throw Error('loja-indisponivel');
  if(p.entrega.tipo==='entrega'&&shop.config?.aceitaEntrega===false)throw Error('entrega-nao-disponivel');
  if(p.entrega.tipo==='retirada'&&shop.config?.aceitaRetirada===false)throw Error('retirada-nao-disponivel');
  const calc=conferirCarrinhoContraSnapshot({...shop,versao:1},p.itens);
  const names=new Map(shop.produtos.map(item=>[String(item.id),item.nome]));
  const id='ON-'+createHash('sha256').update(shop.lojaId+':'+p.requestId).digest('hex').slice(0,24).toUpperCase();
  const pedido={id,criadoEm:now().toISOString(),origem:'commerce-cdn-privado',estado:'pendente',
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
  await write('commerce/pedidos/'+shop.lojaId+'/pendentes/'+id+'.json',pedido);
  return {id,totalCentavos:calc.totalCentavos};
}
const respond=(res,status,data)=>{res.setHeader('Cache-Control','no-store');return res.status(status).json(data);};
const forbidden=(body)=>JSON.stringify(body||{}).length>12_000;
export function createPrivateInboxHandler({verify=verifyOwnerFirebaseIdToken,submit=submitOrder,
  get=privateRead,list=pending,put=privatePut,remove=apiFetch}={}){
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
        if(message==='pedido-ja-registrado')return respond(res,409,{erro:'pedido-ja-registrado'});
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
        const data=await list(uid,req.query?.cursor);
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
      await remove('/delete',{method:'POST',body:JSON.stringify({
        urls:[PRIVATE_ORIGIN+'/'+path]}),extra:{'content-type':'application/json'}});
      return respond(res,200,{status:'arquivado',id});
    }catch{return respond(res,503,{erro:'fila-indisponivel'});}
  };
}
export default createPrivateInboxHandler();