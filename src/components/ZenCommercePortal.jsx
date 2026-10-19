import {lerRascunhoPDV} from '../core/pdvDraft';
import {observarSessaoCommerceZenOS,obterAuthCommerceZenOS,callableCommerceZenOS,ponteCommerceZenOSHabilitada} from '../core/commerceZenOSSession';
import React,{useEffect,useRef,useState} from 'react';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {onAuthStateChanged,signOut} from 'firebase/auth';
import {obterSessaoOperadorCommerce,entrarOperadorCommerce} from '../core/commerceOperatorAuth';
import ZenCommerceStudio from './ZenCommerceStudio';
import ZenCommerceOrderCard from './ZenCommerceOrderCard';
import '../commercePremiumUX.css';
import {prepararFotoProduto,fotoCadastroParaPrevia} from '../core/commerceImages';
import {ZENOS_RUNTIME} from '../core/runtimeEnvironment';
import {conferirRespostaHml} from '../core/commerceHmlTenantBoundary';

const erroAmigavel=e=>{
 const code=String(e?.code||'');
 if(code.includes('not-found'))return 'O serviço Commerce ainda não foi publicado. Utilize a prévia e exporte seu rascunho.';
 if(code.includes('aborted'))return 'Este rascunho foi modificado em outro dispositivo. Recarregue a tela antes de salvar.';
 if(code.includes('unauthenticated'))return 'Faça login novamente para acessar o Commerce.';
 if(code.includes('permission-denied'))return 'Esta conta não possui autorização para a loja.';
 return e?.message||'Serviço temporariamente indisponível. Nenhuma loja foi publicada.';
};

/** O storefront público não é ativado por este componente. */
export default function ZenCommercePortal({produtos=[],userId,operadorAtivo,nuvemSincronizada=false,produtoFocoId=null,focoPedidosOnline=0,onAbrirPedidoPDV=null,integrado=ponteCommerceZenOSHabilitada}){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[erro,setErro]=useState('');
 const [operatorAuth]=useState(()=>integrado?obterAuthCommerceZenOS():obterSessaoOperadorCommerce());
 const [operatorUid,setOperatorUid]=useState(null);
 const [sessaoRevision,setSessaoRevision]=useState(0);
 useEffect(()=>integrado?observarSessaoCommerceZenOS(()=>setSessaoRevision(n=>n+1)):undefined,[integrado]);
 useEffect(()=>onAuthStateChanged(operatorAuth,user=>setOperatorUid(user?.uid||null)),[operatorAuth]);
 // Trocar operador ou sair do módulo encerra a sessão administrativa em memória.
 useEffect(()=>()=>{if(!integrado)void signOut(operatorAuth);},[operatorAuth,userId,operadorAtivo?.id]);
 const [whatsapp,setWhatsapp]=useState(''),[pedidos,setPedidos]=useState([]),[painelErro,setPainelErro]=useState(''),[painelBusy,setPainelBusy]=useState(false);
 const [avisosNovos,setAvisosNovos]=useState(0);
 const idsConhecidos=useRef(null),consultaEmCurso=useRef(false),lojaPedidos=useRef(null);
 const painelPedidosRef=useRef(null);
 const rev=useRef(0);
 const fn=useRef(null);
 const fnMedia=useRef(null);
 useEffect(()=>{
  let ativo=true;setLoading(true);setData(null);setErro('');rev.current=0;fn.current=null;fnMedia.current=null;
  if(!userId||!nuvemSincronizada){setErro('Aguarde a sincronização da loja.');setLoading(false);return()=>{ativo=false;};}
  if(!operatorUid){setErro('Entre com sua conta individual autorizada para salvar e enviar fotos.');setLoading(false);return()=>{ativo=false;};}
  try{
   const callable=(integrado?callableCommerceZenOS('commerceStudio'):httpsCallable(getFunctions(operatorAuth.app,'southamerica-east1'),'commerceStudio'));
   fn.current=callable;
   fnMedia.current=(integrado?callableCommerceZenOS('commerceMidia'):httpsCallable(getFunctions(operatorAuth.app,'southamerica-east1'),'commerceMidia'));
   callable({action:'consultar'}).then(res=>{
    if(!ativo)return;
    const d=res.data||{};if(ZENOS_RUNTIME.isCloudCommerceHml)conferirRespostaHml(d,userId);else if(d.lojaId!==userId)throw new Error('A conta individual pertence a outra loja.');rev.current=d.revision||0;setData(d);setWhatsapp(d.whatsapp||'');
   }).catch(err=>{if(ativo)setErro(erroAmigavel(err));}).finally(()=>{if(ativo)setLoading(false);});
  }catch(e){if(ativo){setErro(erroAmigavel(e));setLoading(false);}}
  return()=>{ativo=false;fn.current=null;fnMedia.current=null;};
 },[userId,nuvemSincronizada,operatorUid,operatorAuth,sessaoRevision]);
 const adminApi=async(action,extra={})=>{
  const data=(await (integrado?callableCommerceZenOS('commercePedidosAdmin'):httpsCallable(getFunctions(operatorAuth.app,'southamerica-east1'),'commercePedidosAdmin'))({action,...extra})).data;
  if(ZENOS_RUNTIME.isCloudCommerceHml)conferirRespostaHml(data,userId);
  return data;
 };
 const abrirPedidoPDV=async id=>{
  if(painelBusy)return;setPainelBusy(true);setPainelErro('');
  try {
   const atual=lerRascunhoPDV(userId,operadorAtivo?.id);
   if((atual?.itensVenda?.length||atual?.prePedidoEmAbertoId||atual?.commerceOrigem)&&atual?.commerceOrigem?.pedidoId!==id)throw Error('Há um atendimento no PDV. Conclua-o antes de abrir outro pedido.');
   const pedido=await adminApi('prepararPDV',{id});
   if(pedido.faturado){await onAbrirPedidoPDV(pedido);await carregarPedidos();setPainelErro('Este pedido já foi faturado. Venda '+pedido.vendaId+'.');return;}
   await onAbrirPedidoPDV(pedido);
  }catch(e){setPainelErro(erroAmigavel(e));}finally{setPainelBusy(false);}
 };
 const carregarPedidos=async(manual=false)=>{
  if(!data?.lojaId||!operatorUid||consultaEmCurso.current)return;
  const lojaAtual=data.lojaId;consultaEmCurso.current=true;
  if(manual){setPainelBusy(true);setAvisosNovos(0);}setPainelErro('');
  try{
   const lista=(await adminApi('listarPedidos')).pedidos;
   if(lojaPedidos.current!==lojaAtual)return;
   const ids=new Set(lista.map(p=>p.id));
   if(idsConhecidos.current){const novos=lista.filter(p=>p.status==='recebido'&&!idsConhecidos.current.has(p.id)).length;if(novos)setAvisosNovos(n=>n+novos);}
   idsConhecidos.current=ids;setPedidos(lista);
  }catch(e){if(lojaPedidos.current===lojaAtual)setPainelErro(erroAmigavel(e));}
  finally{consultaEmCurso.current=false;if(manual)setPainelBusy(false);}
 };
 // Consulta somente enquanto o módulo está aberto e a aba visível. A primeira leitura estabelece a linha de base.
 useEffect(()=>{
  if(!data?.lojaId||!operatorUid){lojaPedidos.current=null;idsConhecidos.current=null;setPedidos([]);setAvisosNovos(0);return;}
  lojaPedidos.current=data.lojaId;idsConhecidos.current=null;setPedidos([]);setAvisosNovos(0);
  void carregarPedidos();
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void carregarPedidos();},90000);
  return()=>{clearInterval(timer);lojaPedidos.current=null;};
 },[data?.lojaId,operatorUid]);
 // Upload acontece apenas na funcao de midia privada. Nenhum produto V1 e alterado.
 const blobBase64=blob=>new Promise((ok,fail)=>{const reader=new FileReader();reader.onerror=()=>fail(new Error('Falha ao ler imagem.'));
  reader.onload=()=>{const raw=String(reader.result||'');const base64=raw.split(',')[1];if(!base64)fail(new Error('Imagem inválida.'));else ok(base64);};reader.readAsDataURL(blob);});
 const subirProduto=async({produtoId,principal,miniatura,origem='galeria'})=>{
  if(!data||!fnMedia.current||!userId)throw new Error('O armazenamento seguro ainda não está disponível.');
  if(!principal?.blob||!miniatura?.blob)throw new Error('Otimize a imagem antes de enviar.');
  const [principalBase64,miniaturaBase64]=await Promise.all([blobBase64(principal.blob),blobBase64(miniatura.blob)]);
  try {const resultado=await fnMedia.current({action:'enviarFotoProduto',produtoId:String(produtoId),origem,principalBase64,miniaturaBase64});
    if(resultado?.data?.status!=='privado'||resultado?.data?.publicado!==false)throw new Error('Upload não confirmado como privado.');
    return resultado.data;
  } catch(e){throw new Error(erroAmigavel(e));}
 };
 const subirBanner=async({arquivo,bannerId,tipo})=>{
  if(!data?.midiaDisponivel||!fnMedia.current)throw new Error('Armazenamento privado indisponível.');
  const preparado=await prepararFotoProduto(arquivo);
  const [principalBase64,miniaturaBase64]=await Promise.all([blobBase64(preparado.principal.blob),blobBase64(preparado.miniatura.blob)]);
  try{
   const r=(await fnMedia.current({action:'enviarBanner',bannerId,tipo:tipo==='imagemMobile'?'mobile':'desktop',principalBase64,miniaturaBase64})).data;
   if(r?.status!=='privado'||r.publicado!==false||!r.storagePath)throw new Error('Upload privado do banner não confirmado.');
   return r;
  }catch(e){throw new Error(erroAmigavel(e));}
 };
 const save=async({aparencia,regras})=>{
  if(!fn.current||!data)throw new Error('Servidor Commerce indisponível. Exporte o rascunho para não perder alterações.');
  try{
   const revisadas={...regras};const pendentes=[];
   for(const produto of produtos){
    const id=String(produto?.id||'');if(!id)continue;
    const regra=revisadas[id];
    if(!regra?.publicado||regra.usarFotoCadastro===false||regra.fotoCadastroStoragePath)continue;
    const foto=fotoCadastroParaPrevia(produto);
    if(!foto||!foto.startsWith('data:image/'))continue;
    if(!data?.midiaDisponivel){pendentes.push(String(produto.nome||id).slice(0,45));continue;}
    try{
     const blob=await (await fetch(foto)).blob();
     const preparado=await prepararFotoProduto(blob);
     const upload=await subirProduto({produtoId:id,...preparado,origem:'cadastro'});
     revisadas[id]={...regra,fotoCadastroStoragePath:upload.storagePath};
    }catch(e){pendentes.push(String(produto.nome||id).slice(0,45));}
   }
   const res=await fn.current({action:'salvarRascunho',expectedRevision:rev.current,rascunho:{aparencia,regras:revisadas}});
   if(ZENOS_RUNTIME.isCloudCommerceHml)conferirRespostaHml(res?.data,userId);
   if(!Number.isSafeInteger(res?.data?.revision)||res.data.revision<=rev.current||
      res.data.status!=='rascunho_privado'||res.data.publicado!==false)
    throw new Error('O servidor não confirmou o salvamento do rascunho. Não atualize a página ainda.');
   rev.current=res.data.revision;
   setData(prev=>prev?{...prev,revision:res.data.revision,regras:revisadas,aparencia}:prev);
   return {...res.data,regras:revisadas,aviso:pendentes.length?`Foto original ainda pendente de sincronização em ${pendentes.length} produto(s). A loja segue privada.`:''};
  }catch(e){throw new Error(erroAmigavel(e));}
 };
 const publicar=async(payload)=>{
  const salvo=await save(payload);if(salvo.aviso)throw new Error(salvo.aviso+' Sincronize as fotos antes de publicar.');
  try{const result=await adminApi('publicar',{expectedRevision:rev.current,whatsapp});setData(prev=>({...prev,idPublico:result.idPublico,lojaPublicada:true}));return {aviso:'Loja publicada com pedidos e atendimento pelo WhatsApp.'};}
  catch(e){throw new Error(erroAmigavel(e));}
 };
 const proposal=async()=>{
  if(!fn.current||!data)throw new Error('Contratação ainda não disponível.');
  const confirmar=window.confirm('Solicitar proposta comercial do ZenOS Commerce? Esta ação não ativa a loja nem gera cobrança.');
  if(!confirmar)throw new Error('Solicitação cancelada.');
  try{return (await fn.current({action:'solicitarProposta',confirmacaoContato:true})).data;}
  catch(e){throw new Error(erroAmigavel(e));}
 };
 // Mesmo com a Loja Online aberta, o aviso leva ao início da central de pedidos.
 useEffect(()=>{
  if(!focoPedidosOnline||!data?.lojaId||produtoFocoId)return;
  const node=painelPedidosRef.current;
  if(!node)return;
  node.scrollIntoView({behavior:'smooth',block:'start'});
  node.focus({preventScroll:true});
 },[focoPedidosOnline,data?.lojaId,produtoFocoId]);
 if(loading)return <div role="status" style={{padding:25,color:'#f8fafc'}}>Verificando sessão e rascunho do Commerce no servidor...</div>;
 // Na homologação cloud, uma prévia que carrega produtos locais não é prova
 // de autorização para gravar. Sem consulta remota válida, não abrir editor.
 if(ZENOS_RUNTIME.isCloudCommerceHml && !data)return (
  <section role="alert" style={{padding:20,border:'1px solid #e0a84e',borderRadius:12,background:'#17212f',color:'#fff',display:'grid',gap:10}}>
   <strong>Loja Online ainda não conectada para salvar</strong>
   <p style={{margin:0}}>{erro||'A sessão administrativa do Commerce não foi confirmada no servidor.'}</p>
   <p style={{margin:0,color:'#d1dce5'}}>Se você acabou de entrar no ZenOS, faça novamente o acesso ao terminal com seu PIN de teste e abra Minha Loja Online. Nenhuma configuração foi publicada ou salva sem confirmação.</p>
   <small style={{color:'#f1bd73'}}>O estoque e a loja fictícia estão preservados. Não refaça a criação de operadores nem altere regras do Firebase.</small>
  </section>
 );
 return <div style={{display:'grid',gap:12}}>
  {!integrado&&<div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
   <button type="button" onClick={async()=>{try{setErro('');if(operatorUid)await signOut(operatorAuth);else await entrarOperadorCommerce();}catch(e){setErro(erroAmigavel(e));}}}>
    {operatorUid?'Encerrar acesso individual':'Entrar como administrador do Commerce'}
   </button>
  </div>}
  {erro&&<div role="status" style={{padding:12,border:'1px solid #84672b',borderRadius:10,color:'#f3ce82',background:'#251f17'}}>
   <strong>Prévia privada:</strong> {erro} Nenhuma contratação ou publicação será feita.
  </div>}
  {data&&!produtoFocoId&&<section id="zen-pedidos-online" ref={painelPedidosRef} tabIndex={-1} className="commerce-admin-panel zen-online-panel">
   <div className="zen-online-panel-head">
    <div><div className="zen-online-overline">CENTRAL DE ATENDIMENTO</div><h3>Pedidos da loja online</h3></div>
    <span role="status" className="zen-online-total">{pedidos.filter(p=>p.status==='recebido').length} novo(s) {avisosNovos>0&&`• +${avisosNovos} desde a última consulta`}</span>
   </div>
   <label className="zen-online-panel-contact">WhatsApp da loja com código do país
    <input type="tel" maxLength={25} placeholder="+55 ou +595..." value={whatsapp} onChange={e=>setWhatsapp(e.target.value)}/>
   </label>
   <p className="zen-online-panel-help">Os pedidos aguardam conferência de disponibilidade, entrega e pagamento. Nenhuma venda, cobrança ou baixa de estoque é feita automaticamente.</p>
   <div className="zen-online-admin-actions">
    <button type="button" disabled={painelBusy} onClick={()=>carregarPedidos(true)}>↻ Atualizar pedidos</button>
    {data.idPublico&&<a href={'/loja/'+data.idPublico} target="_blank" rel="noopener noreferrer">↗ Abrir loja</a>}
    {data.lojaPublicada&&<button type="button" className="zen-online-unpublish" disabled={painelBusy} onClick={async()=>{
     if(!window.confirm('Retirar a loja do ar? Os pedidos serão preservados.'))return;
     setPainelBusy(true);
     try{await adminApi('despublicar');setData(prev=>({...prev,lojaPublicada:false}));}
     catch(e){setPainelErro(erroAmigavel(e));}
     finally{setPainelBusy(false);}
    }}>Retirar loja do ar</button>}
   </div>
   {painelErro&&<p role="alert">{painelErro}</p>}
   <div className="zen-online-order-list">{pedidos.map(p=><ZenCommerceOrderCard key={p.id} pedido={p} ocupado={painelBusy}
    onAbrirPDV={integrado&&onAbrirPedidoPDV?abrirPedidoPDV:null}
    onCancelar={async pedido=>{
     if(!window.confirm('Cancelar este pedido ainda não atendido? Esta ação não movimenta estoque nem caixa.'))return;
     setPainelBusy(true);
     try{await adminApi('atualizarStatus',{id:pedido.id,status:'cancelado'});await carregarPedidos();}
     catch(e){setPainelErro(erroAmigavel(e));}
     finally{setPainelBusy(false);}
    }}/>)}</div>
   {!pedidos.length&&<p className="zen-online-empty">Nenhum pedido na fila. Use “Atualizar pedidos” para consultar as últimas 50 solicitações.</p>}
  </section>}
  <ZenCommerceStudio key={String(userId)+'-'+String(produtoFocoId||'studio')} produtos={produtos} produtoFocoId={produtoFocoId} aparenciaInicial={data?.aparencia}
   regrasIniciais={data?.regras||{}} licenca={data?.licenca||{status:'nao_contratado'}}
   idPublico={data?.idPublico||''}
   onSalvarRascunho={data?save:null} onSolicitarAtivacao={data?proposal:null}
   urlBase={window.location.origin}
   onPublicar={data?.publicacaoHabilitada?publicar:null} onUploadBannerImage={data?.midiaDisponivel?subirBanner:null} onUploadProductImage={data?.midiaDisponivel?subirProduto:null}/>
 </div>;
}
