import React,{useState} from 'react';
import {compartilharDocumento} from '../core/zenShare';
export default function ZenShareButton({documento,perfilLoja,tipo,telefone='',urlDocumento='',arquivoPdf=null,compacto=false}){
 const [processando,setProcessando]=useState(false),[aviso,setAviso]=useState('');
 const enviar=async()=>{if(processando||!documento?.id)return;setProcessando(true);setAviso('');
   try{const r=await compartilharDocumento({documento,perfilLoja,tipo,telefone,urlDocumento,arquivoPdf});setAviso(r.aviso||r.erro||'Compartilhamento iniciado.');}
   catch{setAviso('Falha ao abrir o WhatsApp. Nenhuma venda foi alterada.');}
   finally{setProcessando(false);}
 };
 return <div className="no-print" style={{display:'flex',flexDirection:'column',gap:5,minWidth:0}}>
  <button type="button" disabled={!documento?.id||processando} onClick={enviar}
   style={{width:'100%',padding:compacto?'9px 12px':'12px 14px',background:'#075e54',border:'1px solid #25d366',color:'#fff',borderRadius:10,fontSize:compacto?11:13,fontWeight:800,cursor:'pointer'}}>
   {processando?'Preparando...':'↗ Compartilhar no WhatsApp'}</button>
  {aviso?<span role="status" style={{fontSize:11,color:'#64748b',overflowWrap:'anywhere'}}>{aviso}</span>:null}
 </div>;
}
