import {createHash} from 'node:crypto';
import {criarSnapshotCommercePublico,conferirCarrinhoContraSnapshot} from '../../src/core/commercePublicCatalog.js';
import {normalizarApelidoPublico} from '../../src/core/commerceCdnClient.js';
import {googleServiceToken, getOfficialDocument, documentUrl, decodeDocument} from './_lib/commerceGoogle.js';

const DOC_BASE='https://firestore.googleapis.com/v1/projects/zenos-ac6b2/databases/(default)/documents';
const limited=(v,n)=>String(v??'').trim().slice(0,n);
const fail=code=>{throw Error(code);};
function encodeValue(value){
  if(value===null)return {nullValue:null};
  if(typeof value==='boolean')return {booleanValue:value};
  if(typeof value==='string')return {stringValue:value};
  if(typeof value==='number'&&Number.isFinite(value))
    return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if(Array.isArray(value))return {arrayValue:{values:value.map(encodeValue)}};
  if(value&&typeof value==='object')
    return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encodeValue(v)]))}};
  return {nullValue:null};
}
export function encodeOrderDoc(data,name) {
  return {name,fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,encodeValue(v)]))};
}
export function validarPedidoPublico(body) {
  if(!body||typeof body!=='object'||Array.isArray(body))fail('pedido-invalido');
  const slug=normalizarApelidoPublico(body.slug);
  if(!/^[a-zA-Z0-9_-]{20,100}$/.test(body.requestId||''))fail('chave-idempotencia-invalida');
  const cliente=body.cliente||{},entrega=body.entrega||{},pagamento=body.pagamento||{};
  const nome=limited(cliente.nome,100),telefone=String(cliente.telefone||'').replace(/\D/g,'').slice(0,20);
  if(nome.length<2||nome.length>100||telefone.length<8||telefone.length>15)fail('cliente-invalido');
  const tipo=entrega.tipo;
  if(!['retirada','entrega'].includes(tipo))fail('tipo-entrega-invalido');
  const endereco=tipo==='entrega'?{
    rua:limited(entrega.rua,120),numero:limited(entrega.numero,30),
    bairro:limited(entrega.bairro,100),complemento:limited(entrega.complemento,160),
    cidade:limited(entrega.cidade,90)}:null;
  if(endereco&&(!endereco.rua||!endereco.numero||!endereco.bairro))fail('endereco-invalido');
  const forma=pagamento.forma;
  if(!['pix','cartao','dinheiro'].includes(forma))fail('pagamento-invalido');
  const itens=body.itens;
  if(!Array.isArray(itens)||!itens.length||itens.length>30)fail('itens-invalidos');
  const observacao=limited(cliente.observacao,600);
  const hash=createHash('sha256').update(JSON.stringify({
    slug,nome,telefone,observacao,tipo,endereco,forma,
    trocoPara:forma==='dinheiro'?limited(pagamento.trocoPara,35):'',
    itens:itens.map(i=>({id:i?.id??i?.skuPublico,quantidade:i?.quantidade}))
  })).digest('hex');
  return {slug,requestId:body.requestId,cliente:{nome,telefone,observacao},
    entrega:{tipo,endereco},pagamento:{forma,trocoPara:forma==='dinheiro'?limited(pagamento.trocoPara,35):''},
    itens,hash};
}
export function montarDocumentoPedido({pedido,uid,shop,config,at=()=>new Date()}) {
  const snapshot=criarSnapshotCommercePublico({lojaId:uid,config,produtos:shop.produtos,publicadoEm:at().toISOString()});
  const calculo=conferirCarrinhoContraSnapshot(snapshot,pedido.itens);
  const mapa=new Map(snapshot.produtos.map(p=>[p.id,p]));
  if(pedido.entrega.tipo==='entrega'&&config.aceitaEntrega===false)fail('entrega-desabilitada');
  if(pedido.entrega.tipo==='retirada'&&config.aceitaRetirada===false)fail('retirada-desabilitada');
  const id='ON-'+createHash('sha256').update(uid+':'+pedido.requestId).digest('hex').slice(0,24).toUpperCase();
  const createdAt=at();
  return {id,origem:'commerce',clienteNome:pedido.cliente.nome,
    clienteTelefone:pedido.cliente.telefone,observacao:pedido.cliente.observacao,
    tipoEntrega:pedido.entrega.tipo,endereco:pedido.entrega.endereco,
    formaPagamento:pedido.pagamento.forma,trocoPara:pedido.pagamento.trocoPara,
    statusAtendimento:'pendente',totalBRL:calculo.totalCentavos/100,
    totalCentavos:calculo.totalCentavos,dataHora:createdAt.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),
    criadoEm:createdAt.toISOString(),estado:'pendente',tipoDocumento:'pre_pedido',
    commerceIdempotencyHash:pedido.hash,
    itens:calculo.itens.map((item,i)=>{
      const p=mapa.get(item.id);
      const preco=item.precoUnitarioCentavos/100;
      return {id:id+'-'+i,produtoId:item.id,sku:item.id,nome:snapshot.config.produtosLoja[item.id]?.nomeLoja||p.nome,
        quantidade:item.quantidade,qtd:String(item.quantidade),
        precoUnitarioBRL:preco,precoPraticadoBRL:preco,precoTexto:preco.toFixed(2),
        subtotalBRL:item.subtotalCentavos/100};
    })};
}
async function requestFirestore(path,{method='GET',body,transaction,token,fetchImpl=fetch}={}){
  const target=path+(transaction&&method==='GET'?'?transaction='+encodeURIComponent(transaction):'');
  const res=await fetchImpl(target,{method,headers:{Authorization:'Bearer '+token,
    'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(7000)});
  if(res.status===404&&method==='GET')return null;
  if(!res.ok)throw Error('firestore-operacao-indisponivel');
  return res.json();
}
export async function registrarPedidoTransacional(pedido,{
  fetchImpl=fetch,getSlug=getOfficialDocument,tokenGetter=googleServiceToken,at=()=>new Date()
}={}){
  const alias=await getSlug(['lojas_slugs',pedido.slug],{fetchImpl});
  const uid=alias?.lojaId;
  if(!uid||typeof uid!=='string'||uid.includes('/'))fail('loja-nao-publicada');
  const token=await tokenGetter({fetchImpl});
  const started=await requestFirestore(DOC_BASE+':beginTransaction',
    {method:'POST',body:{options:{readWrite:{}}},fetchImpl,token});
  if(!started?.transaction)fail('transacao-indisponivel');
  const transaction=started.transaction;
  const id='ON-'+createHash('sha256').update(uid+':'+pedido.requestId).digest('hex').slice(0,24).toUpperCase();
  const orderPath=documentUrl('lojas',uid,'pedidos_online',id);
  // Apenas 3 leituras por tentativa dentro da transação (pedido, loja, config).
  const existing=await requestFirestore(orderPath,{fetchImpl,token,transaction});
  if(existing){
    const old=decodeDocument(existing);
    if(old?.commerceIdempotencyHash!==pedido.hash)fail('pedido-conflitante');
    return {id,duplicado:true,totalCentavos:old.totalCentavos};
  }
  const [shopDoc,settingsDoc]=await Promise.all([
    requestFirestore(documentUrl('lojas',uid),{fetchImpl,token,transaction}),
    requestFirestore(documentUrl('lojas',uid,'dados','configuracoes'),{fetchImpl,token,transaction})
  ]);
  const shop=decodeDocument(shopDoc),settings=decodeDocument(settingsDoc);
  if(!shop||!Array.isArray(shop.produtos)||!settings?.commerceConfig)fail('loja-indisponivel');
  if(normalizarApelidoPublico(settings.commerceConfig.slug)!==pedido.slug)fail('apelido-nao-confere');
  const pedidoDoc=montarDocumentoPedido({pedido,uid,shop,config:settings.commerceConfig,at});
  await requestFirestore(DOC_BASE+':commit',{method:'POST',fetchImpl,token,
    body:{transaction,writes:[{update:encodeOrderDoc(pedidoDoc,orderPath.replace('https://firestore.googleapis.com/v1/','')),
      currentDocument:{exists:false}}]}});
  return {id,duplicado:false,totalCentavos:pedidoDoc.totalCentavos};
}
export async function verificarTurnstile(token,{fetchImpl=fetch,ip}={}){
  if(!process.env.ZENOS_COMMERCE_TURNSTILE_SECRET||!process.env.ZENOS_COMMERCE_ALLOWED_HOSTS)
    throw Error('antifraude-nao-configurado');
  if(typeof token!=='string'||token.length<10||token.length>2048)throw Error('desafio-antifraude-invalido');
  const body=new URLSearchParams({secret:process.env.ZENOS_COMMERCE_TURNSTILE_SECRET,response:token});
  if(ip&&/^[\d.a-fA-F:]{3,46}$/.test(ip))body.set('remoteip',ip);
  const res=await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(5000)});
  if(!res.ok)throw Error('antifraude-indisponivel');
  const info=await res.json();
  const allowed=process.env.ZENOS_COMMERCE_ALLOWED_HOSTS.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(!info.success||!allowed.includes(String(info.hostname||'').toLowerCase()))throw Error('desafio-antifraude-invalido');
  return true;
}
export function createCheckoutHandler({verify=verificarTurnstile,record=registrarPedidoTransacional}={}){
  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({erro:'metodo-nao-permitido'});}
    // Produção explicitamente bloqueada até WAF, captcha e integração PDV homologados.
    if(process.env.VERCEL_ENV!=='preview'||process.env.ZENOS_COMMERCE_CHECKOUT_ENABLED!=='true'||
      process.env.ZENOS_COMMERCE_ABUSE_PROTECTION_READY!=='true')
      return res.status(503).json({erro:'checkout-em-homologacao'});
    if(Number(req.headers?.['content-length']||0)>12_000||JSON.stringify(req.body||{}).length>12_000)
      return res.status(413).json({erro:'requisicao-grande-demais'});
    try{
      const pedido=validarPedidoPublico(req.body);
      await verify(req.body?.turnstileToken,{ip:req.headers?.['x-real-ip']});
      const result=await record(pedido);
      return res.status(200).json({status:'recebido',...result});
    }catch(err){
      const message=String(err?.message||'');
      if(/invalido|invalidos|estoque|inativa|desabilitada|nao-publicado|nao-confere|produto-duplicado/.test(message))
        return res.status(422).json({erro:'dados-ou-disponibilidade-invalidos'});
      if(message==='pedido-conflitante')return res.status(409).json({erro:'pedido-conflitante'});
      console.error('[Commerce CDN] Falha no pedido:',message);
      return res.status(503).json({erro:'pedido-nao-confirmado'});
    }
  };
}
export default createCheckoutHandler();