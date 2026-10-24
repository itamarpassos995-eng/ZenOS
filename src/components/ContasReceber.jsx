import React, { useEffect, useMemo, useRef, useState } from 'react';
import { periodoValido, resumirRecebiveis } from '../core/receivablesSummary.js';
import { buscarPaginaExtrato, buscarHistoricoIntegralCliente } from '../core/financialLedgerQueries.js';
const dataLocal=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const hoje=()=>dataLocal(new Date());
const diasAtras=dias=>{const d=new Date();d.setDate(d.getDate()-dias+1);return dataLocal(d);};
const moeda=v=>'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const botao={border:'1px solid #334155',borderRadius:8,background:'#15273b',color:'#e2e8f0',cursor:'pointer',padding:'9px 12px',fontWeight:700};
const celula={borderBottom:'1px solid #263447',padding:'11px 9px',textAlign:'left'};

export default function ContasReceber({db,userId,clientes=[],historicoVendas=[]}) {
 const [periodo,setPeriodo]=useState('7'),[inicioPersonalizado,setInicioPersonalizado]=useState(diasAtras(7));
 const [fimPersonalizado,setFimPersonalizado]=useState(hoje());
 const [aba,setAba]=useState('abertos'),[pesquisa,setPesquisa]=useState('');
 const [cliente,setCliente]=useState(null),[linhas,setLinhas]=useState([]),[cursor,setCursor]=useState(null);
 const [mais,setMais]=useState(false),[estado,setEstado]=useState('nao_consultado');
 const [erro,setErro]=useState(''),[escopoCompleto,setEscopoCompleto]=useState(false);
 const [consultaLegado,setConsultaLegado]=useState(false);
 const serial=useRef(0);
 const inicio=periodo==='personalizado'?inicioPersonalizado:diasAtras(Number(periodo));
 const fim=periodo==='personalizado'?fimPersonalizado:hoje();
 const valido=periodoValido(inicio,fim);
 const resumo=useMemo(()=>valido?resumirRecebiveis({clientes,historicoVendas,inicio,fim}):null,
  [clientes,historicoVendas,inicio,fim,valido]);
 const lista=useMemo(()=>resumo?(aba==='abertos'?resumo.abertos:resumo.vendas).filter(x=>
  !pesquisa.trim()||x.nome.toLocaleLowerCase('pt-BR').includes(pesquisa.trim().toLocaleLowerCase('pt-BR'))):[],
  [resumo,aba,pesquisa]);
 useEffect(()=>{serial.current++;setLinhas([]);setCursor(null);setMais(false);
  setEstado('nao_consultado');setErro('');setEscopoCompleto(false);setConsultaLegado(false);
 },[userId,cliente?.id,inicio,fim]);
 useEffect(()=>()=>{serial.current++;},[]);
 const buscar=async(reiniciar=false)=>{
  if(!cliente||!valido||estado==='carregando')return;
  const key=++serial.current;setErro('');setEstado('carregando');
  try{
   const pagina=await buscarPaginaExtrato({db,userId,clienteId:cliente.id,inicio,fim,cursor:reiniciar?null:cursor});
   if(key!==serial.current)return;
   setLinhas(prev=>{const encontrados=new Map((reiniciar?[]:prev).map(l=>[String(l.id),l]));
    for(const l of pagina.itens)encontrados.set(String(l.id),l);return [...encontrados.values()];});
   setCursor(pagina.cursor);setMais(pagina.possuiMais);setEscopoCompleto(!pagina.possuiMais);
   setConsultaLegado(false);setEstado('confirmado');
  }catch(e){if(key===serial.current){setErro(e?.message||'Consulta indisponível');setEstado('erro');}}
 };
 const legadoCompleto=async()=>{
  if(!cliente||estado==='carregando')return;
  const key=++serial.current;setErro('');setEstado('carregando');
  try{
   const retorno=await buscarHistoricoIntegralCliente({db,userId,clienteId:cliente.id});
   if(key!==serial.current)return;
   setLinhas(retorno.itens);setCursor(null);setMais(false);setEscopoCompleto(true);
   setConsultaLegado(true);setEstado('confirmado');
  }catch(e){if(key===serial.current){setErro(e?.message||'Consulta indisponível');setEstado('erro');}}
 };
 return <section style={{padding:16,maxWidth:1150,margin:'0 auto',color:'#e2e8f0'}}>
  <h2 style={{fontSize:22,margin:'0 0 6px'}}>📆 Contas a Receber</h2>
  <p style={{fontSize:13,color:'#94a3b8'}}>Consulte dívidas e vendas fiadas sem carregar automaticamente o extrato histórico. Dados em aberto vêm do cadastro operacional sincronizado.</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'18px 0'}}>
   {[['7','7 dias'],['30','30 dias'],['personalizado','Escolher período']].map(([id,label])=>
    <button key={id} type="button" onClick={()=>setPeriodo(id)} style={{...botao,background:periodo===id?'#086c67':'#15273b'}}>{label}</button>)}
   {periodo==='personalizado'&&<>
    <label style={{fontSize:12}}>Início <input aria-label="Início do período" type="date" style={botao} value={inicioPersonalizado} onChange={e=>setInicioPersonalizado(e.target.value)}/></label>
    <label style={{fontSize:12}}>Fim <input aria-label="Fim do período" type="date" style={botao} value={fimPersonalizado} onChange={e=>setFimPersonalizado(e.target.value)}/></label>
   </>}
  </div>
  {!valido&&<p role="alert" style={{color:'#fbbf24'}}>O período precisa ter entre 1 e 120 dias.</p>}
  {resumo&&<>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10}}>
    {[['Total em aberto',moeda(resumo.totalAberto)],['Clientes devedores',resumo.quantidadeDevedores],
      ['Vendido fiado no período',moeda(resumo.totalVendido)]].map(([titulo,valor])=>
      <div key={titulo} style={{border:'1px solid #334155',background:'#101f30',padding:16,borderRadius:12}}>
       <div style={{fontSize:11,color:'#94a3b8'}}>{titulo}</div><div style={{fontSize:21,fontWeight:800,marginTop:6}}>{valor}</div>
      </div>)}
   </div>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'19px 0 10px'}}>
    <button type="button" style={{...botao,background:aba==='abertos'?'#086c67':'#15273b'}} onClick={()=>setAba('abertos')}>Todas em aberto</button>
    <button type="button" style={{...botao,background:aba==='vendidos'?'#086c67':'#15273b'}} onClick={()=>setAba('vendidos')}>Vendido fiado no período</button>
    <input style={{...botao,flex:'1 1 180px',minWidth:0}} aria-label="Pesquisar cliente" value={pesquisa}
     onChange={e=>setPesquisa(e.target.value)} placeholder="Pesquisar cliente"/>
   </div>
   <p style={{color:'#94a3b8',fontSize:12}}>{aba==='abertos'
     ? 'Saldo em aberto inclui dívidas antigas. O filtro de período não reduz o total devido.'
     : 'Vendas fiadas concluídas dentro do período; valor original, não saldo individual da venda.'}</p>
   <div style={{overflowX:'auto',border:'1px solid #334155',borderRadius:12}}>
    <table style={{width:'100%',borderCollapse:'collapse',minWidth:640,fontSize:12}}>
     <thead><tr>{['Cliente',aba==='abertos'?'Saldo em aberto':'Vendido fiado','Origem','Ação'].map(t=><th key={t} style={celula}>{t}</th>)}</tr></thead>
     <tbody>{lista.map(v=><tr key={aba+v.id}>
       <td style={celula}>{v.nome}</td><td style={celula}>{moeda(aba==='abertos'?v.saldo:v.valor)}</td>
       <td style={celula}>{aba==='abertos'?'Cadastro do cliente':(v.data+' — '+v.id)}</td>
       <td style={celula}><button style={botao} type="button" disabled={aba==='vendidos'&&!v.clienteId}
        onClick={()=>setCliente({id:aba==='abertos'?v.id:v.clienteId,nome:v.nome})}>Consultar extrato</button></td>
      </tr>)}
      {!lista.length&&<tr><td colSpan={4} style={celula}>Nenhum registro para este filtro.</td></tr>}
     </tbody></table>
   </div>
   <p style={{color:'#fbbf24',fontSize:12,marginTop:14}}>Parcelas e vencimentos individuais ainda não são registrados com baixa vinculada no fiado legado. Não mostramos vencimentos ou quitações inventados.</p>
  </>}
  {cliente&&<div role="dialog" aria-label="Extrato do cliente" style={{position:'fixed',inset:0,zIndex:2500,background:'rgba(0,0,0,.82)',overflowY:'auto',padding:16}}>
   <div style={{maxWidth:950,margin:'4vh auto',borderRadius:13,padding:20,background:'#101b2b',border:'1px solid #334155'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}>
     <h3 style={{margin:0}}>Extrato de {cliente.nome}</h3><button style={botao} type="button" onClick={()=>setCliente(null)}>Fechar</button>
    </div>
    <p style={{color:'#94a3b8',fontSize:12}}>Período selecionado: {inicio} a {fim}. Consulta explícita ao servidor. Registros legados sem data não aparecem na pesquisa por período; use a consulta histórica vinculada para verificá-los.</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
     <button style={botao} type="button" disabled={!valido||estado==='carregando'} onClick={()=>buscar(true)}>Buscar período</button>
     <button style={botao} type="button" disabled={estado==='carregando'} onClick={legadoCompleto}>Consultar lançamentos vinculados do cliente (inclui legado)</button>
    </div>
    {estado==='nao_consultado'&&<p style={{color:'#fbbf24'}} role="status">A consulta ainda não foi iniciada.</p>}
    {estado==='carregando'&&<p role="status">Consultando servidor…</p>}
    {estado==='erro'&&<p role="alert" style={{color:'#fca5a5'}}>Erro: {erro}. Nenhum resultado foi confirmado como completo.</p>}
    {estado==='confirmado'&&<p role="status" style={{color:'#a7f3d0'}}>{consultaLegado
      ? 'Histórico de lançamentos vinculados a este cliente confirmado; documentos sem clienteId exigem auditoria separada.'
      : escopoCompleto?'Páginas percorridas até o fim; atualize para conferir novos lançamentos.':'Página confirmada; outras páginas podem existir. Atualize se houve movimentação concorrente.'}</p>}
    <div style={{overflowX:'auto'}}><table style={{width:'100%',minWidth:670,borderCollapse:'collapse',fontSize:12}}>
     <thead><tr>{['Data','Tipo','Valor','Saldo após','Referência'].map(t=><th key={t} style={celula}>{t}</th>)}</tr></thead>
     <tbody>{linhas.map(l=><tr key={l.id}>
      <td style={celula}>{l.createdAt?new Date(l.createdAt).toLocaleString('pt-BR'):'Sem data'}</td>
      <td style={celula}>{l.tipo||'—'}</td><td style={celula}>{moeda(l.valor)}</td>
      <td style={celula}>{l.saldoClienteDepois==null?'—':moeda(l.saldoClienteDepois)}</td>
      <td style={celula}>{l.referenciaId||l.id}</td>
     </tr>)}</tbody>
    </table></div>
    {estado==='confirmado'&&mais&&!consultaLegado&&
     <button type="button" style={{...botao,marginTop:12}} onClick={()=>buscar(false)}>Carregar mais 50</button>}
    {estado==='confirmado'&&<button type="button" style={{...botao,marginTop:12,marginLeft:8}} onClick={()=>buscar(true)}>Atualizar consulta</button>}
   </div>
  </div>}
 </section>;
}
