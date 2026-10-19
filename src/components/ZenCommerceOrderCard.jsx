import React from 'react';

const statusLabels={
 recebido:'Novo',em_atendimento:'Em atendimento',
 encerrado:'Concluído',cancelado:'Cancelado'
};
const money=centavos=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(centavos)||0)/100);
const quando=v=>{
 const data=new Date(v);
 return Number.isFinite(data.getTime())?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(data):String(v||'Data não disponível');
};

/** Apresentação pura: ações continuam executadas pelo fluxo transacional existente. */
export default function ZenCommerceOrderCard({pedido,ocupado=false,onAbrirPDV,onCancelar}){
 const status=statusLabels[pedido.status]||'Em conferência';
 const novo=pedido.status==='recebido';
 const podeCancelar=novo&&!pedido.pdv&&!pedido.vendaId;
 const podeAbrir=typeof onAbrirPDV==='function'&&pedido.status!=='cancelado';
 const telefone=String(pedido?.cliente?.telefone||'').replace(/\D/g,'');
 const itens=Array.isArray(pedido.itens)?pedido.itens:[];
 const nome=pedido?.cliente?.nome||'Consumidor não identificado';
 return <article className="zen-online-order-card" aria-label={`Pedido ${String(pedido.id||'').slice(0,10).toUpperCase()} de ${nome}`}>
  <header className="zen-online-order-card-head">
   <div className="zen-online-order-identity">
    <span className="zen-online-overline">PEDIDO #{String(pedido.id||'').slice(0,10).toUpperCase()}</span>
    <h4>{nome}</h4>
    <span className="zen-online-order-date">◷ {quando(pedido.criadoEm)}</span>
   </div>
   <div className="zen-online-order-totals">
    <span className={`zen-online-status zen-online-status--${pedido.status||'pendente'}`}>{status}</span>
    <strong>{money(pedido.totalCentavos)}</strong>
    <small>{itens.reduce((n,i)=>n+(Number(i.quantidade)||0),0)} unidade(s)</small>
   </div>
  </header>
  <div className="zen-online-order-items">
   {itens.map((item,i)=><div key={String(item.produtoId||item.sku||i)+'-'+i} className="zen-online-order-line">
    <span className="zen-online-order-qty">{item.quantidade}×</span>
    <span>{item.nome}</span>
   </div>)}
  </div>
  {pedido.observacao&&<div className="zen-online-order-remarks"><b>Observação do cliente</b><p>{pedido.observacao}</p></div>}
  <footer className="zen-online-order-actions">
   {podeAbrir&&<button type="button" className="zen-online-btn zen-online-btn--primary" disabled={ocupado} onClick={()=>onAbrirPDV(pedido.id)}>▣ {pedido.vendaId?'Conferir faturamento':'Abrir no PDV'}</button>}
   {telefone.length>=8&&<a className="zen-online-btn zen-online-btn--secondary" href={'https://wa.me/'+telefone} target="_blank" rel="noopener noreferrer" aria-label={'Atender pelo WhatsApp: '+nome}>◉ WhatsApp</a>}
   {podeCancelar&&<button type="button" className="zen-online-btn zen-online-btn--danger" disabled={ocupado} onClick={()=>onCancelar(pedido)}>Cancelar pedido</button>}
  </footer>
 </article>;
}
