import React,{useEffect,useState} from 'react';
import {compartilharDocumento} from '../core/zenShare';
import {gerarPdfComprovante} from '../core/zenReceiptPdf';

export default function ZenShareButton({documento,perfilLoja,tipo,telefone='',urlDocumento='',compacto=true}){
 const [arquivo,setArquivo]=useState(null);
 const [preparando,setPreparando]=useState(false);
 const [processando,setProcessando]=useState(false);
 const [aviso,setAviso]=useState('');
 useEffect(()=>{
  let ativo=true;setArquivo(null);setAviso('');
  if(!documento?.id){setPreparando(false);return()=>{ativo=false;};}
  setPreparando(true);
  gerarPdfComprovante(documento,perfilLoja||{}).then(({nome,bytes})=>{
   if(!ativo)return;
   const file=typeof File==='function'?new File([bytes],nome,{type:'application/pdf'}):Object.assign(new Blob([bytes],{type:'application/pdf'}),{name:nome});
   setArquivo(file);
  }).catch(err=>{if(ativo)setAviso(err?.message||'Falha ao preparar o PDF.');})
    .finally(()=>{if(ativo)setPreparando(false);});
  return()=>{ativo=false;};
 },[documento,perfilLoja]);
 const enviar=async()=>{
  if(!documento?.id||processando||preparando||!arquivo)return;
  setProcessando(true);setAviso('');
  try{const r=await compartilharDocumento({documento,perfilLoja,tipo,telefone,urlDocumento,arquivoPdf:arquivo});
    setAviso(r.aviso||r.erro||'Compartilhamento iniciado.');
  }catch{setAviso('Não foi possível compartilhar. A venda não foi alterada.');}
  finally{setProcessando(false);}
 };
 return <>
  <button type="button" disabled={!documento?.id||processando||preparando||!arquivo} onClick={enviar}
   aria-label="Compartilhar PDF do comprovante" title="Celular: compartilhamento do PDF. Computador: baixa o PDF e abre o WhatsApp."
   style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,width:'100%',height:62,minHeight:62,minWidth:0,
    boxSizing:'border-box',padding:'6px 8px',textAlign:'center',background:'#075e54',border:'1px solid #25d366',
    color:'#fff',borderRadius:10,fontSize:compacto?12:13,fontWeight:800,cursor:'pointer',
    lineHeight:1.2,whiteSpace:'normal',overflowWrap:'anywhere',opacity:preparando||processando?.7:1}}>
   <span aria-hidden="true">↗</span><span>{preparando?'Preparando PDF':processando?'Compartilhando':'WhatsApp PDF'}</span>
  </button>
  {aviso&&<div role="status" style={{position:'fixed',right:12,bottom:12,zIndex:29999,padding:'12px 14px',maxWidth:360,
    background:'#102a34',color:'#fff',border:'1px solid #25d366',boxShadow:'0 8px 25px #0005',borderRadius:9,fontSize:12}}>
    {aviso}<button type="button" onClick={()=>setAviso('')} aria-label="Fechar aviso" style={{marginLeft:10,background:'none',color:'#fff',border:0,cursor:'pointer'}}>✕</button>
   </div>}
 </>;
}
