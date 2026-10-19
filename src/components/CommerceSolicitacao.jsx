import React,{useEffect,useRef,useState} from 'react';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {auth} from '../firebase';
import './CommerceSolicitacao.css';

const translation={
 nao_solicitado:['Disponível para solicitar','Disponible para solicitar','Available to request'],
 pendente_analise:['Solicitação recebida','Solicitud recibida','Request received'],
 em_analise:['Em análise','En evaluación','Under review'],
 aprovado:['Aprovação registrada — ativação pendente','Aprobación registrada — activación pendiente','Approved — awaiting activation'],
 rejeitado:['Solicitação revisada — entre em contato com o ZenOS','Solicitud revisada — contacte a ZenOS','Request reviewed — contact ZenOS'],
};
const helpError=(error,tx)=>{
 const code=String(error?.code||'');
 if(code.includes('unauthenticated'))return tx('Faça login novamente para consultar sua solicitação.','Inicie sesión de nuevo para consultar su solicitud.','Sign in again to check your request.');
 if(code.includes('permission-denied'))return tx('Não foi possível confirmar que esta loja pertence à sua conta.','No se pudo confirmar que esta tienda pertenece a su cuenta.','We could not verify that this store belongs to your account.');
 return tx('Não foi possível confirmar a operação. Nenhum módulo foi ativado. Tente consultar novamente.','No fue posible confirmar la operación. No se activó ningún módulo. Consulte nuevamente.','Could not confirm the operation. No module was activated. Check again.');
};
export default function CommerceSolicitacao({lojaId,tx=(pt)=>pt}){
 const [registro,setRegistro]=useState(null);
 const [erro,setErro]=useState('');
 const [carregando,setCarregando]=useState(true);
 const [enviando,setEnviando]=useState(false);
 const seq=useRef(0);
 const chamar=async action=>{
   const user=auth.currentUser;
   if(!user||user.uid!==lojaId)throw Object.assign(new Error('Identidade não confirmada'),{code:'permission-denied'});
   const callable=httpsCallable(getFunctions(undefined,'southamerica-east1'),'commerceSolicitacaoCliente',{timeout:35000});
   const response=await callable({action,lojaId});
   if(!translation[response.data?.status]||response.data?.habilitado!==false)throw Error('COMMERCE_RESPONSE_UNEXPECTED');
   return response.data;
 };
 const consultar=async()=>{
   const version=++seq.current;
   setCarregando(true);setErro('');
   try{const data=await chamar('consultar');if(seq.current===version)setRegistro(data);}
   catch(e){if(seq.current===version){setRegistro(null);setErro(helpError(e,tx));}}
   finally{if(seq.current===version)setCarregando(false);}
 };
 useEffect(()=>{seq.current++;setRegistro(null);setErro('');setEnviando(false);void consultar();
   return()=>{seq.current++;};
 },[lojaId]);
 const solicitar=async()=>{
   if(enviando||carregando||registro?.status!=='nao_solicitado')return;
   const version=++seq.current;setEnviando(true);setErro('');
   try{const data=await chamar('solicitar');if(seq.current===version)setRegistro(data);}
   catch(e){if(seq.current===version)setErro(helpError(e,tx));}
   finally{if(seq.current===version)setEnviando(false);}
 };
 const status=registro?.status||'nao_solicitado';
 return <section className="commerce-request" aria-label={tx('Minha Loja Online','Mi Tienda Online','My Online Store')}>
  <div className="commerce-request-intro">
   <span className="commerce-request-kicker">ZENOS COMMERCE PREMIUM</span>
   <h1>{tx('Sua loja virtual, no seu ZenOS','Su tienda virtual, dentro de ZenOS','Your online store, inside ZenOS')}</h1>
   <p>{tx('Venda seus produtos com uma vitrine profissional e receba pedidos dentro do sistema, aproveitando os cadastros e o atendimento que você já utiliza.','Muestre sus productos en un catálogo profesional y reciba pedidos directamente en ZenOS.','Show your products in a professional storefront and manage incoming requests inside ZenOS.')}</p>
   <div className="commerce-request-benefits">
    <span>✓ {tx('Vitrine personalizada','Escaparate personalizado','Custom storefront')}</span>
    <span>✓ {tx('Produtos e fotos integrados','Productos y fotos integrados','Connected products and photos')}</span>
    <span>✓ {tx('Avisos de novos pedidos','Avisos de pedidos nuevos','New-order alerts')}</span>
    <span>✓ {tx('Atendimento pelo pré-pedido','Atención por prepedido','Pre-order workflow')}</span>
   </div>
  </div>
  <div className="commerce-request-panel">
   <div className="commerce-request-badge">{tx('MÓDULO OPCIONAL','MÓDULO OPCIONAL','OPTIONAL MODULE')}</div>
   <h2>{tx('Ativação sob aprovação','Activación sujeta a aprobación','Activation by approval')}</h2>
   <p>{tx('Solicite o Commerce Premium aqui mesmo. Nossa equipe avaliará o pedido e avisará os próximos passos. Você continuará usando o ZenOS normalmente.','Solicite Commerce Premium aquí. Nuestro equipo revisará el pedido y le indicará los siguientes pasos. ZenOS seguirá funcionando normalmente.','Request Commerce Premium here. Our team will review it and share the next steps. Your existing ZenOS stays available.')}</p>
   {carregando?<div role="status" className="commerce-request-status">{tx('Consultando sua solicitação…','Consultando su solicitud…','Checking your request…')}</div>:
    registro?<div role="status" className="commerce-request-status">
     <small>{tx('Situação da solicitação','Estado de la solicitud','Request status')}</small>
     <strong>{tx(...translation[status])}</strong>
     {status!=='nao_solicitado'&&<span>{tx('O módulo permanece desativado até nossa confirmação individual.','El módulo permanece desactivado hasta nuestra confirmación individual.','The module remains disabled until individual activation is confirmed.')}</span>}
    </div>:null}
   {erro&&<div role="alert" className="commerce-request-error">{erro}</div>}
   {registro?.status==='nao_solicitado'&&<button type="button" className="commerce-request-action" disabled={enviando||carregando} onClick={solicitar}>{enviando?tx('Enviando solicitação…','Enviando solicitud…','Sending request…'):tx('Solicitar ativação','Solicitar activación','Request activation')}</button>}
   {!enviando&&<button type="button" className="commerce-request-refresh" disabled={carregando} onClick={consultar}>{tx('Atualizar situação','Actualizar estado','Refresh status')}</button>}
   <small className="commerce-request-disclaimer">{tx('A solicitação não gera cobrança, não publica produtos e não movimenta caixa, estoque ou fiado.','La solicitud no genera cobros, no publica productos y no modifica caja, inventario ni crédito.','Requesting does not charge you, publish products, or change your sales or inventory.')}</small>
  </div>
 </section>;
}