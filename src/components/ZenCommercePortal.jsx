import React,{useEffect,useRef,useState} from 'react';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {onAuthStateChanged,signOut} from 'firebase/auth';
import {obterSessaoOperadorCommerce,entrarOperadorCommerce} from '../core/commerceOperatorAuth';
import ZenCommerceStudio from './ZenCommerceStudio';
import {prepararFotoProduto,fotoCadastroParaPrevia} from '../core/commerceImages';

const erroAmigavel=e=>{
 const code=String(e?.code||'');
 if(code.includes('not-found'))return 'O serviço Commerce ainda não foi publicado. Utilize a prévia e exporte seu rascunho.';
 if(code.includes('aborted'))return 'Este rascunho foi modificado em outro dispositivo. Recarregue a tela antes de salvar.';
 if(code.includes('unauthenticated'))return 'Faça login novamente para acessar o Commerce.';
 if(code.includes('permission-denied'))return 'Esta conta não possui autorização para a loja.';
 return e?.message||'Serviço temporariamente indisponível. Nenhuma loja foi publicada.';
};

/** O storefront público não é ativado por este componente. */
export default function ZenCommercePortal({produtos=[],userId,operadorAtivo,nuvemSincronizada=false}){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[erro,setErro]=useState('');
 const [operatorAuth]=useState(obterSessaoOperadorCommerce);
 const [operatorUid,setOperatorUid]=useState(null);
 useEffect(()=>onAuthStateChanged(operatorAuth,user=>setOperatorUid(user?.uid||null)),[operatorAuth]);
 // Trocar operador ou sair do módulo encerra a sessão administrativa em memória.
 useEffect(()=>()=>{void signOut(operatorAuth);},[operatorAuth,userId,operadorAtivo?.id]);
 const [whatsapp,setWhatsapp]=useState(''),[pedidos,setPedidos]=useState([]),[painelErro,setPainelErro]=useState(''),[painelBusy,setPainelBusy]=useState(false);
 const [avisosNovos,setAvisosNovos]=useState(0);
 const idsConhecidos=useRef(null),consultaEmCurso=useRef(false),lojaPedidos=useRef(null);
 const rev=useRef(0);
 const fn=useRef(null);
 const fnMedia=useRef(null);
 useEffect(()=>{
  let ativo=true;setLoading(true);setData(null);setErro('');rev.current=0;fn.current=null;fnMedia.current=null;
  if(!userId||!nuvemSincronizada){setErro('Aguarde a sincronização da loja.');setLoading(false);return()=>{ativo=false;};}
  if(!operatorUid){setErro('Entre com sua conta individual autorizada para salvar e enviar fotos.');setLoading(false);return()=>{ativo=false;};}
  try{
   const callable=httpsCallable(getFunctions(operatorAuth.app,'southamerica-east1'),'commerceStudio');
   fn.current=callable;
   fnMedia.current=httpsCallable(getFunctions(operatorAuth.app,'southamerica-east1'),'commerceMidia');
   callable({action:'consultar'}).then(res=>{
    if(!ativo)return;
    const d=res.data||{};if(d.lojaId!==userId)throw new Error('A conta individual pertence a outra loja.');rev.current=d.revision||0;setData(d);setWhatsapp(d.whatsapp||'');
   }).catch(err=>{if(ativo)setErro(erroAmigavel(err));}).finally(()=>{if(ativo)setLoading(false);});
  }catch(e){if(ativo){setErro(erroAmigavel(e));setLoading(false);}}
  return()=>{ativo=false;fn.current=null;fnMedia.current=null;};
 },[userId,nuvemSincronizada,operatorUid,operatorAuth]);
 const adminApi=async(action,extra={})=>(await httpsCallable(getFunctions(operatorAuth.app,'southamerica-east1'),'commercePedidosAdmin')({action,...extra})).data;
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
   rev.current=res.data.revision;
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
 if(loading)return <div style={{padding:25,color:'#f8fafc'}}>Carregando Commerce Studio...</div>;
 return <div style={{display:'grid',gap:12}}>
  <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
   <button type="button" onClick={async()=>{try{setErro('');if(operatorUid)await signOut(operatorAuth);else await entrarOperadorCommerce();}catch(e){setErro(erroAmigavel(e));}}}>
    {operatorUid?'Encerrar acesso individual':'Entrar como administrador do Commerce'}
   </button>
  </div>
  {erro&&<div role="status" style={{padding:12,border:'1px solid #84672b',borderRadius:10,color:'#f3ce82',background:'#251f17'}}>
   <strong>Prévia privada:</strong> {erro} Nenhuma contratação ou publicação será feita.
  </div>}
  {data&&<section className="commerce-admin-panel" style={{padding:20,border:'1px solid #395368',borderRadius:12,color:'#edf4f8',display:'grid',gap:12}}>
   <h3 style={{margin:0}}>Pedidos da loja online {avisosNovos>0&&<span role="status" style={{color:'#ffe19c',fontSize:12,marginLeft:8}}>{avisosNovos} novo(s) desde a última consulta</span>}</h3>
   <label>WhatsApp da loja com código do país<input type="tel" maxLength={25} placeholder="+55 ou +595..." value={whatsapp} onChange={e=>setWhatsapp(e.target.value)} style={{margin:8,padding:10,color:'#162D38'}}/></label>
   <small>Pedidos ficam aguardando confirmação. Nenhuma venda, cobrança ou baixa de estoque é feita automaticamente.</small>
   <div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button disabled={painelBusy} onClick={()=>carregarPedidos(true)}>Atualizar pedidos</button>
    {data.idPublico&&<a href={'/loja/'+data.idPublico} target="_blank" rel="noopener noreferrer" style={{color:'#e9bc7a'}}>Abrir loja</a>}
    {data.lojaPublicada&&<button disabled={painelBusy} onClick={async()=>{if(!window.confirm('Retirar a loja do ar? Os pedidos serão preservados.'))return;setPainelBusy(true);try{await adminApi('despublicar');setData(prev=>({...prev,lojaPublicada:false}));}catch(e){setPainelErro(erroAmigavel(e));}finally{setPainelBusy(false);}}}>Retirar loja do ar</button>}
   </div>
   {painelErro&&<p role="alert">{painelErro}</p>}
   {pedidos.map(p=><article key={p.id} style={{background:'#10212e',padding:12,borderRadius:9}}><b>{p.id.slice(0,10).toUpperCase()} — {p.cliente.nome}</b><p>{p.criadoEm} • {p.status} • R$ {(p.totalCentavos/100).toFixed(2)}</p><p>{p.itens.map(i=>i.quantidade+' × '+i.nome).join(' / ')}</p><p>{p.observacao}</p><a style={{color:'#e9bc7a'}} href={'https://wa.me/'+p.cliente.telefone} target="_blank" rel="noopener noreferrer">Atender pelo WhatsApp</a><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>{['em_atendimento','encerrado','cancelado'].map(status=><button key={status} disabled={painelBusy||p.status===status||['encerrado','cancelado'].includes(p.status)} onClick={async()=>{setPainelBusy(true);try{await adminApi('atualizarStatus',{id:p.id,status});await carregarPedidos();}catch(e){setPainelErro(erroAmigavel(e));}finally{setPainelBusy(false);}}}>{status.replace('_',' ')}</button>)}</div></article>)}
   {!pedidos.length&&<small>Clique em atualizar para consultar os últimos 50 pedidos.</small>}
  </section>}
  <ZenCommerceStudio key={userId} produtos={produtos} aparenciaInicial={data?.aparencia}
   regrasIniciais={data?.regras||{}} licenca={data?.licenca||{status:'nao_contratado'}}
   idPublico={data?.idPublico||''}
   onSalvarRascunho={data?save:null} onSolicitarAtivacao={data?proposal:null}
   urlBase={window.location.origin}
   onPublicar={data?.publicacaoHabilitada?publicar:null} onUploadBannerImage={data?.midiaDisponivel?subirBanner:null} onUploadProductImage={data?.midiaDisponivel?subirProduto:null}/>
 </div>;
}
