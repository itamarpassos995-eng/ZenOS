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
    const d=res.data||{};if(d.lojaId!==userId)throw new Error('A conta individual pertence a outra loja.');rev.current=d.revision||0;setData(d);
   }).catch(err=>{if(ativo)setErro(erroAmigavel(err));}).finally(()=>{if(ativo)setLoading(false);});
  }catch(e){if(ativo){setErro(erroAmigavel(e));setLoading(false);}}
  return()=>{ativo=false;fn.current=null;fnMedia.current=null;};
 },[userId,nuvemSincronizada,operatorUid,operatorAuth]);
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
  <ZenCommerceStudio key={userId} produtos={produtos} aparenciaInicial={data?.aparencia}
   regrasIniciais={data?.regras||{}} licenca={data?.licenca||{status:'nao_contratado'}}
   idPublico={data?.idPublico||''}
   onSalvarRascunho={data?save:null} onSolicitarAtivacao={data?proposal:null}
   onPublicar={null} onUploadBannerImage={null} onUploadProductImage={data?.midiaDisponivel?subirProduto:null}/>
 </div>;
}
