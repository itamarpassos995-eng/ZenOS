import React,{useEffect,useRef,useState} from 'react';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {auth} from '../firebase';
import ZenCommerceStudio from './ZenCommerceStudio';

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
 const rev=useRef(0);
 const fn=useRef(null);
 useEffect(()=>{
  let ativo=true;setLoading(true);setData(null);setErro('');rev.current=0;
  if(!userId||!nuvemSincronizada){setErro('Aguarde a sincronização da loja.');setLoading(false);return()=>{ativo=false;};}
  try{
   const callable=httpsCallable(getFunctions(auth.app,'southamerica-east1'),'commerceStudio');
   fn.current=callable;
   callable({action:'consultar'}).then(res=>{
    if(!ativo)return;
    const d=res.data||{};rev.current=d.revision||0;setData(d);
   }).catch(err=>{if(ativo)setErro(erroAmigavel(err));}).finally(()=>{if(ativo)setLoading(false);});
  }catch(e){if(ativo){setErro(erroAmigavel(e));setLoading(false);}}
  return()=>{ativo=false;};
 },[userId,nuvemSincronizada]);
 const save=async({aparencia,regras})=>{
  if(!fn.current||!data)throw new Error('Servidor Commerce indisponível. Exporte o rascunho para não perder alterações.');
  try{const res=await fn.current({action:'salvarRascunho',expectedRevision:rev.current,rascunho:{aparencia,regras}});
   rev.current=res.data.revision;return res.data;
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
  {erro&&<div role="status" style={{padding:12,border:'1px solid #84672b',borderRadius:10,color:'#f3ce82',background:'#251f17'}}>
   <strong>Prévia privada:</strong> {erro} Nenhuma contratação ou publicação será feita.
  </div>}
  <ZenCommerceStudio key={userId} produtos={produtos} aparenciaInicial={data?.aparencia}
   regrasIniciais={data?.regras||{}} licenca={data?.licenca||{status:'nao_contratado'}}
   idPublico={data?.idPublico||''}
   onSalvarRascunho={data?save:null} onSolicitarAtivacao={data?proposal:null}
   onPublicar={null} onUploadBannerImage={null}/>
 </div>;
}
